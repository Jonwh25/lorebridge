import { searchCampaign } from "./search-campaign.js";
import type { CampaignSearchMatch } from "@lorebridge/shared/capabilities";
import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const COMMAND_EXACT = "/lb";
const COMMAND_PREFIX = "/lb ";

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

function isLbCommand(value: string): boolean {
  const t = value.trim();
  return t === COMMAND_EXACT || t.startsWith(COMMAND_PREFIX);
}

function extractQuestion(value: string): string {
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

    const question = extractQuestion(text);

    if (!question) {
      ui.notifications.warn("LoreBridge: Please include a question after /lb, e.g. /lb Who is Strahd?");
      return false;
    }

    // Clear the editor content
    if ((target as { value?: string }).value !== undefined) {
      (target as HTMLInputElement).value = "";
    } else if (target.isContentEditable) {
      target.textContent = "";
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }

    void handleQuestion(question);
    return false;
  });
}
