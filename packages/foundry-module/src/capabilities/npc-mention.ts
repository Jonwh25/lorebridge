import { getLoreBridgeSettings } from "../settings.js";
import { getActorDossierCache, getDossierSummaryText } from "./campaign-codex-widget.js";

const MODULE_ID = "lorebridge";
const HISTORY_MAX = 20;
const HISTORY_WARN = 16;
const MEMORY_CAP = 50;
const MEMORY_PROMPT_MAX = 20;

type Turn = { role: "user" | "assistant"; content: string };

// ---------------------------------------------------------------------------
// NPC Memory — persistent interaction history stored in actor flags (#198)
// ---------------------------------------------------------------------------

export type NpcMemoryEntry = {
  id: string;
  timestamp: number;
  playerName: string;
  playerMessage: string;
  npcResponse: string;
};

export function getMemories(actor: FoundryActor): NpcMemoryEntry[] {
  return (actor.getFlag(MODULE_ID, "memories") as NpcMemoryEntry[] | undefined) ?? [];
}

async function appendMemory(
  actor: FoundryActor,
  playerName: string,
  playerMessage: string,
  npcResponse: string,
): Promise<void> {
  const memories = getMemories(actor);
  const id = typeof crypto !== "undefined" && typeof (crypto as { randomUUID?: () => string }).randomUUID === "function"
    ? (crypto as { randomUUID: () => string }).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  memories.push({ id, timestamp: Date.now(), playerName, playerMessage, npcResponse });
  if (memories.length > MEMORY_CAP) memories.splice(0, memories.length - MEMORY_CAP);
  await actor.setFlag(MODULE_ID, "memories", memories);
}

export async function deleteMemory(actor: FoundryActor, memoryId: string): Promise<void> {
  const memories = getMemories(actor).filter(m => m.id !== memoryId);
  await actor.setFlag(MODULE_ID, "memories", memories);
}

export async function clearMemories(actor: FoundryActor): Promise<void> {
  await actor.setFlag(MODULE_ID, "memories", []);
}

// In-memory conversation history keyed by actor ID; resets on page reload
const _history = new Map<string, Turn[]>();

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function enabledActors(): FoundryActor[] {
  return Array.from(game.actors as Iterable<FoundryActor>)
    .filter((a) => a.getFlag(MODULE_ID, "aiEnabled") === true);
}

function parseAtMention(rawContent: string): { actor: FoundryActor; message: string } | null {
  const text = stripHtml(rawContent).trim();
  if (!text.startsWith("@")) return null;
  const rest = text.slice(1);

  // Try longest actor names first so "Guard Captain" wins over "Guard"
  const actors = enabledActors().sort((a, b) => b.name.length - a.name.length);
  for (const actor of actors) {
    if (rest.toLowerCase().startsWith(actor.name.toLowerCase())) {
      const msg = rest.slice(actor.name.length).replace(/^[\s:,]+/, "").trim();
      return { actor, message: msg || "..." };
    }
  }
  return null;
}

async function playTts(actor: FoundryActor, text: string): Promise<void> {
  const voiceId = (actor.getFlag(MODULE_ID, "voiceId") as string | undefined) ?? "";
  if (!voiceId) return;

  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) return;

  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
  const response = await fetch(`${base}v1/tts/speak`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text, voiceId }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    ui.notifications.warn(`LoreBridge TTS: ${err?.error?.message ?? `Error ${response.status}`}`);
    return;
  }

  const data = (await response.json()) as { audio: string; mimeType: string };
  const audio = new Audio(`data:${data.mimeType};base64,${data.audio}`);
  audio.volume = (game.settings?.get?.("core", "globalAmbientVolume") as number | undefined) ?? 1;
  await audio.play();
}

async function callRoleplay(
  actor: FoundryActor,
  history: Turn[],
  message: string,
  memories: NpcMemoryEntry[],
): Promise<string> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }

  const biography = (
    (actor.system as { details?: { biography?: { value?: string } } })
      ?.details?.biography?.value ?? ""
  ).replace(/<[^>]+>/g, "").slice(0, 2000);

  const preamble = (actor.getFlag(MODULE_ID, "preamble") as string | undefined) ?? "";

  // Prefer Campaign Codex Dossier roleplay data when present; fall back to
  // preamble (GM-authored), then system trait field.
  const dossier = getActorDossierCache(actor);
  const dossierPersonality = dossier ? getDossierSummaryText(dossier, true).slice(0, 2000) : "";
  const personality =
    preamble ||
    dossierPersonality ||
    ((actor.system as { details?: { trait?: string } })?.details?.trait ?? "");

  const memoryPayload = memories.map(m => ({
    playerName: m.playerName,
    playerMessage: m.playerMessage,
    npcResponse: m.npcResponse,
  }));

  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
  const response = await fetch(`${base}v1/generate/roleplay`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ actorName: actor.name, biography, personality, history, message, memories: memoryPayload }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = (await response.json()) as { response: string };
  return data.response;
}

async function handleNpcMention(msg: unknown): Promise<void> {
  if (!game.user?.isGM) return;

  const settings = getLoreBridgeSettings();
  if (!settings.npcMentionEnabled) return;

  const chatMsg = msg as FoundryChatMessage & { flags?: Record<string, unknown> };

  // Don't respond to LoreBridge's own messages
  if (chatMsg.flags?.[MODULE_ID]) return;

  const parsed = parseAtMention(chatMsg.content);
  if (!parsed) return;

  const { actor, message } = parsed;
  const actorId = actor.id;
  const history = _history.get(actorId) ?? [];

  if (history.length >= HISTORY_WARN) {
    ui.notifications.warn(
      `LoreBridge: ${actor.name}'s conversation history is getting long (${history.length / 2} exchanges). It will be pruned after ${HISTORY_MAX / 2}.`,
    );
  }

  try {
    const recentMemories = getMemories(actor).slice(-MEMORY_PROMPT_MAX);
    const response = await callRoleplay(actor, history, message, recentMemories);

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: response });
    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    _history.set(actorId, history);

    const playerName = chatMsg.author?.name ?? "Unknown";
    void appendMemory(actor, playerName, message, response).catch((err: unknown) => {
      console.warn("LoreBridge | Failed to save NPC memory:", err);
    });

    await ChatMessage.create({
      content: `<p>${response.replace(/\n/g, "<br>")}</p>`,
      speaker: { alias: actor.name },
      flags: { [MODULE_ID]: { type: "npc-mention", actorId, actorName: actor.name } },
    });

    // Fire-and-forget TTS — a missing voice ID or unconfigured key is a no-op
    void playTts(actor, response).catch((err: unknown) => {
      console.warn("LoreBridge | TTS playback failed:", err);
    });
  } catch (err) {
    ui.notifications.error(
      `LoreBridge: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public helpers (used by ui-chat.ts /lb npc commands)
// ---------------------------------------------------------------------------

export function getNpcHistory(actorId: string): Turn[] {
  return _history.get(actorId) ?? [];
}

export function clearNpcHistory(actorId: string): void {
  _history.delete(actorId);
}

export async function setNpcAiEnabled(actor: FoundryActor, enabled: boolean): Promise<void> {
  await actor.setFlag(MODULE_ID, "aiEnabled", enabled);
}

export async function setNpcPreamble(actor: FoundryActor, preamble: string): Promise<void> {
  await actor.setFlag(MODULE_ID, "preamble", preamble);
}

export function listEnabledNpcs(): Array<{ name: string; id: string; preamble: string }> {
  return enabledActors().map((a) => ({
    name: a.name,
    id: a.id,
    preamble: (a.getFlag(MODULE_ID, "preamble") as string | undefined) ?? "",
  }));
}

export function registerNpcMentionHook(): void {
  Hooks.on("createChatMessage", (msg: unknown) => {
    void handleNpcMention(msg);
  });
}

// ---------------------------------------------------------------------------
// Actor sheet header button — Configure NPC Preamble
// ---------------------------------------------------------------------------

function openNpcPreambleDialog(actor: FoundryActor): void {
  const aiEnabled = actor.getFlag(MODULE_ID, "aiEnabled") === true;
  const preamble = (actor.getFlag(MODULE_ID, "preamble") as string | undefined) ?? "";
  const voiceId = (actor.getFlag(MODULE_ID, "voiceId") as string | undefined) ?? "";

  const content = `
    <form style="display:flex;flex-direction:column;gap:12px;padding:8px 0">
      <div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:bold;cursor:pointer">
          <input type="checkbox" name="aiEnabled"${aiEnabled ? " checked" : ""}>
          Enable AI responses for this NPC
        </label>
        <p style="margin:4px 0 0 24px;font-size:11px;opacity:0.7">
          When enabled, players can address this NPC in chat with <code>@${actor.name} &lt;message&gt;</code>.
        </p>
      </div>
      <div>
        <label style="display:block;font-weight:bold;margin-bottom:4px">Personality preamble</label>
        <textarea name="preamble" rows="5" style="width:100%;box-sizing:border-box;resize:vertical;font-size:12px;font-family:inherit" placeholder="Describe this NPC's personality, knowledge, speech patterns, and secrets the AI should know…">${preamble}</textarea>
        <p style="margin:4px 0 0;font-size:11px;opacity:0.7">
          Overrides the actor's biography for AI roleplay. Leave blank to use the biography instead.
        </p>
      </div>
      <div>
        <label style="display:block;font-weight:bold;margin-bottom:4px">ElevenLabs Voice ID <span style="font-weight:normal;opacity:0.6">(optional)</span></label>
        <input type="text" name="voiceId" value="${voiceId}" style="width:100%;box-sizing:border-box;font-size:12px;font-family:monospace" placeholder="e.g. 21m00Tcm4TlvDq8ikWAM">
        <p style="margin:4px 0 0;font-size:11px;opacity:0.7">
          Copy a Voice ID from your ElevenLabs account. When set, AI responses will be spoken aloud.
        </p>
      </div>
    </form>`;

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: `LoreBridge — NPC Preamble: ${actor.name}`, resizable: true },
    position: { width: 480 },
    content,
    buttons: [
      {
        action: "save",
        label: "Save",
        icon: "fas fa-save",
        default: true,
        callback: (_event: Event, _button: HTMLElement, dlg: unknown) => {
          const el = (dlg as { element: HTMLElement }).element;
          const enabled = el.querySelector<HTMLInputElement>("input[name='aiEnabled']")?.checked ?? false;
          const text = el.querySelector<HTMLTextAreaElement>("textarea[name='preamble']")?.value ?? "";
          const voice = el.querySelector<HTMLInputElement>("input[name='voiceId']")?.value.trim() ?? "";
          void Promise.all([
            actor.setFlag(MODULE_ID, "aiEnabled", enabled),
            actor.setFlag(MODULE_ID, "preamble", text),
            actor.setFlag(MODULE_ID, "voiceId", voice),
          ]).then(() => {
            ui.notifications.info(`LoreBridge: Settings saved for ${actor.name}.`);
          });
        },
      },
      { action: "cancel", label: "Cancel" },
    ],
  });
  void dialog.render({ force: true });
}

export function registerNpcPreambleSheetHook(): void {
  // Foundry v14 ApplicationV2 hook; dnd5e 5.x sheets all extend ActorSheetV2
  Hooks.on("getHeaderControlsActorSheetV2", (...args: unknown[]) => {
    const [app, controls] = args as [{ document?: FoundryActor }, unknown[]];
    if (!game.user?.isGM) return;
    const actor = app.document;
    if (!actor) return;
    // Guard against the known duplicate-entry bug in Foundry v14
    if ((controls as Array<{ class?: string }>).some((c) => c.class === "lorebridge-npc-preamble")) return;
    controls.push({
      label: "Configure NPC Preamble",
      class: "lorebridge-npc-preamble",
      icon: "fas fa-bridge",
      // ApplicationHeaderControlsEntry uses onClick (capital C), not onclick
      onClick: () => openNpcPreambleDialog(actor),
    });
  });
}
