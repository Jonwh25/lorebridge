import { getLoreBridgeSettings, getFoundrySettingsApi } from "../settings.js";
import { searchJournals } from "./journals.js";
import { isPlayerVisible } from "./visibility.js";

const MODULE_ID = "lorebridge";

type SocketMessage = {
  type: string;
  userId?: string;
  question?: string;
};

type FoundrySocket = {
  on(event: string, handler: (data: SocketMessage) => void): void;
  emit(event: string, data: SocketMessage): void;
};

type FoundryUser = { id: string; isGM: boolean; name: string };
type FoundryUsers = Iterable<FoundryUser> & { get(id: string): FoundryUser | undefined };

function getSocket(): FoundrySocket {
  return (game.socket as unknown) as FoundrySocket;
}

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

// ---------------------------------------------------------------------------
// Allowlist read/write
// ---------------------------------------------------------------------------

export function getPlayerLoreAllowlist(): string[] {
  const raw = String(getFoundrySettingsApi().get(MODULE_ID, "playerLoreAllowlist") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // fall through to empty default
  }
  return [];
}

export async function setPlayerLoreAllowlist(ids: string[]): Promise<void> {
  await (getFoundrySettingsApi() as unknown as { set(m: string, k: string, v: string): Promise<unknown> })
    .set(MODULE_ID, "playerLoreAllowlist", JSON.stringify(ids));
}

// ---------------------------------------------------------------------------
// GM-side request handler (runs only on the GM's browser via socket guard)
// ---------------------------------------------------------------------------

export async function handlePlayerLoreRequest(userId: string, question: string): Promise<void> {
  const settings = getLoreBridgeSettings();
  if (!settings.playerLoreEnabled) return;

  const users = game.users as unknown as FoundryUsers;
  const user = users.get(userId);
  const whisper = user ? [user.id] : [];

  const allowlist = getPlayerLoreAllowlist();

  if (allowlist.length === 0) {
    await ChatMessage.create({
      content: `<p><em>LoreBridge: No lore has been published for players yet. Ask your GM to set up the Player Lore feature.</em></p>`,
      whisper,
      speaker: { alias: "LoreBridge" },
      flags: { [MODULE_ID]: { type: "player-lore-answer", userId, question } },
    });
    return;
  }

  const worldName = game.world?.title ?? "Unknown World";

  try {
    // Search player-visible journals, then filter to the allowlist.
    const searchResult = searchJournals({ query: question, mode: "player", limit: 20 });
    const filtered = searchResult.results.filter((r) => allowlist.includes(r.journalId));

    const context = filtered.slice(0, 5).map((r) => ({
      type: "journal",
      name: r.journalName,
      excerpt: r.excerpt ?? "",
    }));

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
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
    }

    const data = (await response.json()) as { answer: string };

    const sourceNames = [...new Set(filtered.slice(0, 5).map((r) => r.journalName))];
    const sourceLine = sourceNames.length > 0
      ? `<p style="font-size:11px;color:#888;margin-top:6px"><em>Sources: ${sourceNames.map((n) => `<strong>${escapeHtml(n)}</strong>`).join(", ")}</em></p>`
      : "";

    // Count sources hidden from the player: not player-visible + player-visible but not allowlisted.
    const notAllowlisted = searchResult.results.length - filtered.length;
    const totalHidden = searchResult.hiddenCount + notAllowlisted;
    const hiddenLine = totalHidden > 0
      ? `<p style="font-size:11px;color:#888;margin-top:2px"><em>${totalHidden} source${totalHidden === 1 ? "" : "s"} not shared with players.</em></p>`
      : "";

    const content = [
      `<div class="lorebridge-chat-answer">`,
      `<p><strong>LoreBridge — Q:</strong> ${escapeHtml(question)}</p>`,
      `<hr>`,
      `<p>${data.answer.replace(/\n/g, "<br>")}</p>`,
      sourceLine,
      hiddenLine,
      `</div>`,
    ].join("\n");

    await ChatMessage.create({
      content,
      whisper,
      speaker: { alias: "LoreBridge" },
      flags: { [MODULE_ID]: { type: "player-lore-answer", userId, question } },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("LoreBridge | Player lore request failed:", msg);
    ui.notifications.error(`LoreBridge: Player lore request failed — ${msg}`);

    // Notify the requesting player without leaking the error message.
    try {
      await ChatMessage.create({
        content: `<p><em>LoreBridge: Sorry, your question could not be answered right now. Please try again later.</em></p>`,
        whisper,
        speaker: { alias: "LoreBridge" },
        flags: { [MODULE_ID]: { type: "player-lore-error", userId } },
      });
    } catch { /* best effort */ }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Socket listener (registered on all browsers; GM-gated inside)
// ---------------------------------------------------------------------------

export function registerPlayerLoreSocketListener(): void {
  getSocket().on("module.lorebridge", (data: SocketMessage) => {
    if (!game.user?.isGM) return;
    if (data.type === "player-lore-request" && data.userId && data.question) {
      void handlePlayerLoreRequest(data.userId, data.question);
    }
  });
}

// ---------------------------------------------------------------------------
// Player-side socket emit (called from ui-chat.ts for non-GM users)
// ---------------------------------------------------------------------------

export function emitPlayerLoreRequest(userId: string, question: string): void {
  getSocket().emit("module.lorebridge", { type: "player-lore-request", userId, question });
}

// ---------------------------------------------------------------------------
// GM allowlist management dialog
// ---------------------------------------------------------------------------

export function openPlayerLoreAllowlistDialog(): void {
  if (!game.journal) {
    ui.notifications.warn("LoreBridge: The journal collection is not available.");
    return;
  }

  const allowlist = getPlayerLoreAllowlist();

  type JournalEntry = { id: string; name: string; ownership: Record<string, number> };
  const journals = Array.from(game.journal as Iterable<JournalEntry>)
    .filter((j) => isPlayerVisible(j.ownership))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (journals.length === 0) {
    ui.notifications.info(
      "LoreBridge: No player-visible journals found. Set a journal's default ownership to Observer or higher so it can be published to players.",
    );
    return;
  }

  const rows = journals.map((j) => {
    const checked = allowlist.includes(j.id) ? " checked" : "";
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.08);cursor:pointer">
        <input type="checkbox" name="journal-${j.id}"${checked} style="flex:0 0 auto">
        <span style="font-size:12px">${escapeHtml(j.name)}</span>
      </label>`;
  }).join("");

  const content = `
    <div>
      <p style="font-size:12px;color:#888;margin:0 0 8px">
        Select which player-visible journals players can query with <code>/lb ask</code>.
        Only journals with Observer or higher default ownership are listed here.
      </p>
      <div style="max-height:300px;overflow-y:auto;border:1px solid rgba(0,0,0,0.2);border-radius:4px;padding:4px 8px">
        ${rows}
      </div>
    </div>`;

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — Player Lore Allowlist", resizable: true },
    position: { width: 440 },
    content,
    buttons: [
      {
        action: "save",
        label: "Save",
        icon: "fas fa-save",
        default: true,
        callback: (_event: Event, _button: HTMLElement, dlg: unknown) => {
          const el = (dlg as { element: HTMLElement }).element;
          const selected = journals
            .filter((j) => el.querySelector<HTMLInputElement>(`input[name='journal-${j.id}']`)?.checked)
            .map((j) => j.id);
          void setPlayerLoreAllowlist(selected).then(() => {
            ui.notifications.info(
              `LoreBridge: Player lore allowlist saved — ${selected.length} journal${selected.length === 1 ? "" : "s"} published.`,
            );
          });
        },
      },
      { action: "cancel", label: "Cancel" },
    ],
  });
  void dialog.render({ force: true });
}

// ---------------------------------------------------------------------------
// Thin ApplicationV2-compatible wrapper used as the settings menu `type`
// ---------------------------------------------------------------------------

export class PlayerLoreAllowlistApp {
  static DEFAULT_OPTIONS: Record<string, unknown> = { id: "lorebridge-player-lore-allowlist" };
  readonly element: HTMLElement = document.createElement("div");

  render(_options?: unknown): void {
    openPlayerLoreAllowlistDialog();
  }

  async close(): Promise<void> { /* no-op — DialogV2 manages its own lifecycle */ }
}
