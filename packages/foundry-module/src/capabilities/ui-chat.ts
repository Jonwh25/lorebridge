import { searchCampaign } from "./search-campaign.js";
import type { CampaignSearchMatch } from "@lorebridge/shared/capabilities";
import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const COMMAND_EXACT = "/lb";
const COMMAND_PREFIX = "/lb ";

// ---------------------------------------------------------------------------
// Roleplay state (#99)
// ---------------------------------------------------------------------------

type RoleplayState = {
  actorId: string;
  actorName: string;
  biography: string;
  personality: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

let activeRoleplay: RoleplayState | null = null;

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function askBackend(
  question: string,
  context: Array<{ type: string; name: string; excerpt: string }>,
  worldName: string,
): Promise<string> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, "v1/chat/ask");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ question, context, worldName }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = await response.json() as { answer: string; provider: string };
  return data.answer;
}

async function handleQuestion(question: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb is only available to GMs.");
    return;
  }

  const worldName = game.world?.title ?? "Unknown World";

  try {
    let context: Array<{ type: string; name: string; excerpt: string }> = [];
    try {
      const results = await searchCampaign({ query: question, mode: "gm" });
      context = results.results.slice(0, 5).map((r: CampaignSearchMatch) => {
        if (r.documentType === "journal") {
          return { type: "journal", name: r.journalName, excerpt: r.excerpt ?? "" };
        } else if (r.documentType === "actor") {
          return { type: "actor", name: r.actorName, excerpt: r.excerpt ?? "" };
        } else {
          return { type: "scene", name: r.sceneName, excerpt: "" };
        }
      });
    } catch {
      // context gathering is best-effort; proceed without it
    }

    const answer = await askBackend(question, context, worldName);

    const gmIds = (game.users as { filter(fn: (u: { isGM: boolean }) => boolean): Array<{ id: string }> })
      .filter((u) => u.isGM)
      .map((u) => u.id);

    const content = [
      `<div class="lorebridge-chat-answer">`,
      `<p><strong>LoreBridge — Q:</strong> ${question}</p>`,
      `<hr>`,
      `<p>${answer.replace(/\n/g, "<br>")}</p>`,
      `</div>`,
    ].join("\n");

    await ChatMessage.create({
      content,
      whisper: gmIds,
      speaker: { alias: "LoreBridge" },
      flags: { [MODULE_ID]: { type: "chat-answer", question } },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ui.notifications.error(`LoreBridge: ${msg}`);
  }
}

async function roleplayBackend(state: RoleplayState, message: string): Promise<string> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, "v1/generate/roleplay");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      actorName: state.actorName,
      biography: state.biography,
      personality: state.personality,
      history: state.history,
      message,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = await response.json() as { response: string };
  return data.response;
}

async function handleRoleplayMessage(message: string): Promise<void> {
  if (!activeRoleplay) return;
  const state = activeRoleplay;
  try {
    const response = await roleplayBackend(state, message);
    state.history.push({ role: "user", content: message });
    state.history.push({ role: "assistant", content: response });
    // Keep history bounded to last 20 turns
    if (state.history.length > 20) state.history = state.history.slice(-20);

    const gmIds = (game.users as { filter(fn: (u: { isGM: boolean }) => boolean): Array<{ id: string }> })
      .filter((u) => u.isGM)
      .map((u) => u.id);

    const content = [
      `<div class="lorebridge-chat-answer">`,
      `<p><em>${state.actorName} says:</em></p>`,
      `<p>${response.replace(/\n/g, "<br>")}</p>`,
      `</div>`,
    ].join("\n");

    await ChatMessage.create({
      content,
      whisper: gmIds,
      speaker: { alias: state.actorName },
      flags: { [MODULE_ID]: { type: "roleplay", actorName: state.actorName } },
    });
  } catch (error) {
    ui.notifications.error(`LoreBridge roleplay failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function startRoleplay(actorName: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb roleplay is only available to GMs.");
    return;
  }
  const name = actorName.trim();
  if (!name) {
    ui.notifications.warn("LoreBridge: Usage: /lb roleplay <NPC name>");
    return;
  }

  const actors = Array.from(game.actors as Iterable<FoundryActor>);
  const actor = actors.find((a) => a.name.toLowerCase() === name.toLowerCase())
    ?? actors.find((a) => a.name.toLowerCase().includes(name.toLowerCase()));

  if (!actor) {
    ui.notifications.warn(`LoreBridge: No actor found named "${name}".`);
    return;
  }

  const biography = ((actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "")
    .replace(/<[^>]+>/g, "").slice(0, 2000);
  const personality = ((actor.system as { details?: { trait?: string; ideal?: string } })?.details?.trait ?? "");

  activeRoleplay = {
    actorId: actor.id,
    actorName: actor.name,
    biography,
    personality,
    history: [],
  };

  const gmIds = (game.users as { filter(fn: (u: { isGM: boolean }) => boolean): Array<{ id: string }> })
    .filter((u) => u.isGM)
    .map((u) => u.id);

  await ChatMessage.create({
    content: `<p><em>LoreBridge: Now in roleplay mode as <strong>${actor.name}</strong>. Type <code>/lb &lt;message&gt;</code> to speak with them, or <code>/lb end</code> to stop.</em></p>`,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
    flags: { [MODULE_ID]: { type: "roleplay-start", actorName: actor.name } },
  });
}

function isLbCommand(value: string): boolean {
  const t = value.trim();
  return t === COMMAND_EXACT || t.startsWith(COMMAND_PREFIX);
}

function extractArguments(value: string): string {
  const t = value.trim();
  return t.startsWith(COMMAND_PREFIX) ? t.slice(COMMAND_PREFIX.length).trim() : "";
}

export function registerChatCommand(): void {
  // chatInput is the v14 hook for intercepting chat input keystrokes.
  // Returning false suppresses default processing (prevents the "not a valid
  // command" error). Setting options.recordPending = false keeps chat history
  // in sync when we clear the input ourselves.
  Hooks.on("chatInput", (event: unknown, options: unknown): boolean | void => {
    const e = event as KeyboardEvent;
    if (e.key !== "Enter" || e.shiftKey) return;

    const target = e.target as HTMLElement;
    const text = (
      (target as { value?: string }).value ??
      target.textContent ??
      ""
    ).trim();

    if (!isLbCommand(text)) return;

    // Prevent Foundry's command validator and history recording
    (options as { recordPending: boolean }).recordPending = false;

    const args = extractArguments(text);

    if (!args) {
      ui.notifications.warn("LoreBridge: Please include a question after /lb, e.g. /lb Who is Strahd?");
      return false;
    }

    // /lb end — stop roleplay
    if (args === "end") {
      if (activeRoleplay) {
        const name = activeRoleplay.actorName;
        activeRoleplay = null;
        ui.notifications.info(`LoreBridge: Roleplay with ${name} ended.`);
      } else {
        ui.notifications.warn("LoreBridge: No active roleplay session.");
      }
      return false;
    }

    // /lb roleplay <name>
    if (args.startsWith("roleplay ")) {
      const actorName = args.slice("roleplay ".length).trim();
      void startRoleplay(actorName);
      return false;
    }

    // /lb <message> — route to roleplay or Q&A
    if (activeRoleplay) {
      // Clear the input so the sent message doesn't linger on screen
      if ("value" in target) {
        (target as HTMLInputElement).value = "";
      } else {
        target.textContent = "";
      }
      void handleRoleplayMessage(args);
    } else {
      void handleQuestion(args);
    }
    return false;
  });
}
