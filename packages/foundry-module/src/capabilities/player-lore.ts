import { searchJournals } from "./journals.js";

const MODULE_ID = "lorebridge";

// ---------------------------------------------------------------------------
// Direct settings access — avoids a circular dependency with settings.ts
// ---------------------------------------------------------------------------

type RawSettings = {
  get(moduleId: string, key: string): unknown;
  set(moduleId: string, key: string, value: unknown): Promise<unknown>;
};

function rawSettings(): RawSettings {
  return (game.settings as unknown) as RawSettings;
}

function getPlayerSettings(): { playerLoreEnabled: boolean; backendUrl: string; clientToken: string } {
  const s = rawSettings();
  return {
    playerLoreEnabled: Boolean(s.get(MODULE_ID, "playerLoreEnabled")),
    backendUrl: String(s.get(MODULE_ID, "backendUrl") ?? "").trim(),
    clientToken: String(s.get(MODULE_ID, "clientToken") ?? ""),
  };
}

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
type PlayerLoreJournal = {
  id: string;
  name: string;
  testUserPermission(user: FoundryUser, permission: number): boolean;
};

const OBSERVER_PERMISSION = 2;

export function isPlayerLoreVisibleToAllPlayers(
  journal: PlayerLoreJournal,
  users: Iterable<FoundryUser>,
): boolean {
  return Array.from(users)
    .filter((candidate) => !candidate.isGM)
    .every((player) => journal.testUserPermission(player, OBSERVER_PERMISSION));
}

function getSocket(): FoundrySocket {
  return ((game as unknown) as { socket: FoundrySocket }).socket;
}

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

// ---------------------------------------------------------------------------
// Allowlist read/write
// ---------------------------------------------------------------------------

export function getPlayerLoreAllowlist(): string[] {
  const raw = String(rawSettings().get(MODULE_ID, "playerLoreAllowlist") ?? "[]");
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
  await rawSettings().set(MODULE_ID, "playerLoreAllowlist", JSON.stringify(ids));
}

// ---------------------------------------------------------------------------
// GM-side request handler (runs only on the GM's browser via socket guard)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Keyword extraction — strips question preambles and stop words so that
// "tell me about Sir Sonnet" searches for "sir sonnet" rather than the
// full natural-language phrase, which would never substring-match.
// ---------------------------------------------------------------------------

function extractSearchTerms(question: string): string {
  const stopWords = new Set([
    "a", "about", "an", "and", "any", "are", "at", "be", "by", "can",
    "could", "describe", "details", "do", "does", "explain", "find",
    "for", "from", "get", "give", "had", "has", "have", "he", "her",
    "him", "his", "how", "i", "if", "in", "info", "information", "is",
    "it", "its", "know", "like", "list", "me", "more", "my", "of",
    "on", "or", "our", "please", "she", "show", "some", "summarize",
    "tell", "the", "their", "them", "there", "they", "this", "to",
    "us", "was", "we", "were", "what", "when", "where", "which",
    "who", "will", "with", "would", "you",
  ]);
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
  return words.length > 0 ? words.join(" ") : question;
}

export async function handlePlayerLoreRequest(userId: string, question: string): Promise<void> {
  const settings = getPlayerSettings();
  if (!settings.playerLoreEnabled) return;

  const users = game.users as unknown as FoundryUsers;
  const user = users.get(userId);
  // Status/error messages always whisper to the requesting user.
  const privateWhisper = user ? [user.id] : [];
  // GM answers are whispered; player answers go to general chat so the whole table benefits.
  const answerWhisper = (user?.isGM ?? false) ? privateWhisper : [];

  const allowlist = getPlayerLoreAllowlist();

  if (allowlist.length === 0) {
    await ChatMessage.create({
      content: `<p><em>LoreBridge: No lore has been published for players yet. Ask your GM to set up the Player Lore feature.</em></p>`,
      whisper: privateWhisper,
      speaker: { alias: "LoreBridge" },
      flags: { [MODULE_ID]: { type: "player-lore-answer", userId, question } },
    });
    return;
  }

  const worldName = game.world?.title ?? "Unknown World";

  try {
    // Extract keywords from the natural-language question so that
    // "tell me about Sir Sonnet" searches for "sir sonnet" rather than
    // the full phrase, which would never substring-match journal text.
    const searchQuery = extractSearchTerms(question);
    // The answer is posted to public chat, so every source must be observable by
    // every non-GM world user. Use Foundry's effective permission API rather than
    // trusting ownership.default, which does not account for per-user overrides.
    const journals = Array.from(game.journal as unknown as Iterable<PlayerLoreJournal>);
    const journalById = new Map(journals.map((journal) => [journal.id, journal]));
    const searchResult = searchJournals({ query: searchQuery, mode: "gm", limit: 20 });
    const filtered = searchResult.results.filter((result) => {
      if (!allowlist.includes(result.journalId)) return false;
      const journal = journalById.get(result.journalId);
      return journal ? isPlayerLoreVisibleToAllPlayers(journal, users) : false;
    });

    // Short-circuit: if no allowed journals matched, return the no-info message
    // without calling the backend. This avoids LLM non-determinism on sparse context
    // and saves tokens.
    if (filtered.length === 0) {
      const askerName = user?.name ? escapeHtml(user.name) : "Unknown";
      await ChatMessage.create({
        content: [
          `<div class="lorebridge-chat-answer">`,
          `<p><strong>LoreBridge — Q (${askerName}):</strong> ${escapeHtml(question)}</p>`,
          `<hr>`,
          `<p><em>The lore is silent on that particular mystery.</em></p>`,
          `</div>`,
        ].join("\n"),
        whisper: answerWhisper,
        speaker: { alias: "LoreBridge" },
        flags: { [MODULE_ID]: { type: "player-lore-answer", userId, question } },
      });
      return;
    }

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

    const askerName = user?.name ? escapeHtml(user.name) : "Unknown";
    const content = [
      `<div class="lorebridge-chat-answer">`,
      `<p><strong>LoreBridge — Q (${askerName}):</strong> ${escapeHtml(question)}</p>`,
      `<hr>`,
      `<p>${data.answer.replace(/\n/g, "<br>")}</p>`,
      sourceLine,
      `</div>`,
    ].join("\n");

    await ChatMessage.create({
      content,
      whisper: answerWhisper,
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
        whisper: privateWhisper,
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

  const users = game.users as unknown as FoundryUsers;
  const journals = Array.from(game.journal as unknown as Iterable<PlayerLoreJournal>)
    .filter((journal) => isPlayerLoreVisibleToAllPlayers(journal, users))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (journals.length === 0) {
    ui.notifications.info(
      "LoreBridge: No journals are visible to every player. Grant Observer access or higher to all players before publishing lore.",
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
        Only journals that every non-GM player can observe are listed here.
      </p>
      <label style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:4px;background:rgba(0,0,0,0.05);border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px">
        <input type="checkbox" id="lb-player-lore-all" style="flex:0 0 auto">
        All
      </label>
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
  void dialog.render({ force: true }).then(() => {
    const el = dialog.element as HTMLElement;
    const allCb = el.querySelector<HTMLInputElement>("#lb-player-lore-all");
    if (!allCb) return;
    const getJournalCbs = () => Array.from(el.querySelectorAll<HTMLInputElement>("input[name^='journal-']"));
    const syncAllState = () => {
      const cbs = getJournalCbs();
      const n = cbs.filter((c) => c.checked).length;
      allCb.indeterminate = n > 0 && n < cbs.length;
      allCb.checked = n === cbs.length;
    };
    syncAllState();
    allCb.addEventListener("click", () => {
      const shouldCheck = !getJournalCbs().every((c) => c.checked);
      getJournalCbs().forEach((c) => { c.checked = shouldCheck; });
      allCb.indeterminate = false;
      allCb.checked = shouldCheck;
    });
    getJournalCbs().forEach((cb) => { cb.addEventListener("change", syncAllState); });
  });
}

