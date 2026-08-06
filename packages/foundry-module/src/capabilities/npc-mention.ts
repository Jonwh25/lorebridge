import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const HISTORY_MAX = 20;
const HISTORY_WARN = 16;

type Turn = { role: "user" | "assistant"; content: string };

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

async function callRoleplay(actor: FoundryActor, history: Turn[], message: string): Promise<string> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }

  const biography = (
    (actor.system as { details?: { biography?: { value?: string } } })
      ?.details?.biography?.value ?? ""
  ).replace(/<[^>]+>/g, "").slice(0, 2000);

  const preamble = (actor.getFlag(MODULE_ID, "preamble") as string | undefined) ?? "";
  const personality =
    preamble ||
    ((actor.system as { details?: { trait?: string } })?.details?.trait ?? "");

  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
  const response = await fetch(`${base}v1/generate/roleplay`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ actorName: actor.name, biography, personality, history, message }),
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
    const response = await callRoleplay(actor, history, message);

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: response });
    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    _history.set(actorId, history);

    await ChatMessage.create({
      content: `<p>${response.replace(/\n/g, "<br>")}</p>`,
      speaker: { alias: actor.name },
      flags: { [MODULE_ID]: { type: "npc-mention", actorId, actorName: actor.name } },
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
