import { searchCampaign } from "./search-campaign.js";
import type { CampaignSearchMatch } from "@lorebridge/shared/capabilities";
import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const COMMAND_PREFIX = "/lb ";

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

export function registerChatCommand(): void {
  Hooks.on("chatMessage", (_chatLog: unknown, message: unknown, _data: unknown): boolean | void => {
    if (typeof message !== "string") return;
    const trimmed = message.trim();
    if (!trimmed.startsWith(COMMAND_PREFIX) && trimmed !== "/lb") return;

    const question = trimmed.slice(COMMAND_PREFIX.length).trim();
    if (!question) {
      ui.notifications.warn("LoreBridge: Please include a question after /lb.");
      return false;
    }

    if (!game.user?.isGM) {
      ui.notifications.warn("LoreBridge: /lb is only available to GMs.");
      return false;
    }

    const worldName = game.world?.title ?? "Unknown World";

    void (async () => {
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
        const message = error instanceof Error ? error.message : String(error);
        ui.notifications.error(`LoreBridge: ${message}`);
      }
    })();

    return false;
  });
}
