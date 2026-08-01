import { searchCampaign } from "./search-campaign.js";
import type { CampaignSearchMatch } from "@lorebridge/shared/capabilities";
import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const COMMAND_PREFIX = "/lb ";
const COMMAND_EXACT = "/lb";

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function askBackend(question: string, context: Array<{ type: string; name: string; excerpt: string }>, worldName: string): Promise<string> {
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
      // context gathering is best-effort; continue without it
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

export function registerChatCommand(): void {
  // Foundry v14 validates slash commands against a registered list before the
  // chatMessage hook fires. We intercept in the capture phase of keydown on the
  // chat input so our handler runs before Foundry's command validator.
  Hooks.on("renderChatLog", (_app: unknown, html: unknown) => {
    const root = html as HTMLElement;
    const input = root.querySelector<HTMLInputElement>("#chat-message");
    if (!input) return;

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const value = input.value.trim();
      if (!value.startsWith(COMMAND_EXACT)) return;

      const question = value.startsWith(COMMAND_PREFIX)
        ? value.slice(COMMAND_PREFIX.length).trim()
        : "";

      if (!question) {
        ui.notifications.warn("LoreBridge: Please include a question after /lb.");
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();
      input.value = "";
      void handleQuestion(question);
    }, { capture: true });
  });
}
