import { searchCampaign } from "./search-campaign.js";
import type { CampaignSearchMatch } from "@lorebridge/shared/capabilities";
import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const COMMAND_EXACT = "/lb";
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

function isLbCommand(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === COMMAND_EXACT || trimmed.startsWith(COMMAND_PREFIX);
}

function extractQuestion(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(COMMAND_PREFIX) ? trimmed.slice(COMMAND_PREFIX.length).trim() : "";
}

function attachToChatInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  if ((input as HTMLElement & { _lbAttached?: boolean })._lbAttached) return;
  (input as HTMLElement & { _lbAttached?: boolean })._lbAttached = true;

  // Intercept keydown Enter in capture phase — runs before Foundry's handler
  input.addEventListener("keydown", (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== "Enter" || ke.shiftKey) return;
    if (!isLbCommand(input.value)) return;

    ke.preventDefault();
    ke.stopImmediatePropagation();

    const question = extractQuestion(input.value);
    input.value = "";

    if (!question) {
      ui.notifications.warn("LoreBridge: Please include a question after /lb, e.g. /lb Who is Strahd?");
      return;
    }

    void handleQuestion(question);
  }, { capture: true });

  // Also intercept form submit as a belt-and-suspenders fallback
  const form = input.closest("form");
  if (form && !(form as HTMLElement & { _lbAttached?: boolean })._lbAttached) {
    (form as HTMLElement & { _lbAttached?: boolean })._lbAttached = true;
    form.addEventListener("submit", (e: Event) => {
      if (!isLbCommand(input.value)) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const question = extractQuestion(input.value);
      input.value = "";

      if (!question) {
        ui.notifications.warn("LoreBridge: Please include a question after /lb, e.g. /lb Who is Strahd?");
        return;
      }

      void handleQuestion(question);
    }, { capture: true });
  }
}

function findAndAttach(): void {
  // v14 uses a textarea; v13 and below used an input. Try both.
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "#chat-message, #chat-log textarea, #chat-log input[type=text]"
  );
  if (input) attachToChatInput(input);
}

export function registerChatCommand(): void {
  // The chat log is already rendered when ready fires — attach directly.
  findAndAttach();

  // Re-attach if the chat log is ever re-rendered.
  Hooks.on("renderChatLog", (_app: unknown, html: unknown) => {
    const root = html as HTMLElement;
    const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "#chat-message, textarea, input[type=text]"
    );
    if (input) attachToChatInput(input);
  });
}
