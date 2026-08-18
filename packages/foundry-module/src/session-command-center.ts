import { getLoreBridgeSettings } from "./settings.js";
import { escHtml } from "./utils/html.js";
import { postBackend } from "./capabilities/tracker-shared.js";
import { checkCampaignHealth } from "./capabilities/health-check.js";
import { handleSessionCleanup } from "./capabilities/session-cleanup.js";
import { removeNonGmUsers } from "./capabilities/session-tools.js";
import {
  initializeNpcStatusTracker,
  updateNpcStatusFromLatest,
} from "./capabilities/tracker-npc-status.js";
import {
  initializeNpcEncounterTracker,
  updateNpcEncountersFromLatest,
} from "./capabilities/tracker-npc-encounters.js";
import {
  initializeQuestStatusTracker,
  updateQuestStatusFromLatest,
} from "./capabilities/tracker-quest-status.js";
import {
  initializeRegionVisitTracker,
  updateRegionVisitsFromLatest,
} from "./capabilities/tracker-region-visits.js";
import { matchPortraits } from "./capabilities/portrait-matcher.js";
import { syncPermissions } from "./capabilities/permissions-sync.js";
import { runExportCCJournals } from "./capabilities/cc-journal-export.js";
import { runCreateSessionLog } from "./capabilities/session-log-creator.js";
import { runBackupActorsNpcs } from "./capabilities/backup-actors-npcs.js";
import { runBackupActorsPlayers } from "./capabilities/backup-actors-players.js";
import { runBackupJournals } from "./capabilities/backup-journals-github.js";
import { runBackupMacros } from "./capabilities/backup-macros.js";
import { runBackupSessionLogs } from "./capabilities/backup-session-logs.js";

// ---------------------------------------------------------------------------
// Test-safe ApplicationV2 base
// ---------------------------------------------------------------------------

const _TestSafeBase = class {
  static DEFAULT_OPTIONS = {};
  readonly rendered = false;
  readonly element: HTMLElement = document.createElement("div");
  render(_o?: boolean | { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  close(_o?: { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  bringToFront(): void { return; }
  async _renderHTML(_c: Record<string, unknown>, _o: unknown): Promise<HTMLElement> { return document.createElement("div"); }
  _replaceHTML(_r: HTMLElement, _c: HTMLElement, _o: unknown): void { return; }
  _onClickAction(_e: PointerEvent, _t: HTMLElement): void { return; }
} as unknown as typeof FoundryApplicationV2;

const _AppBase: typeof FoundryApplicationV2 = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: { ApplicationV2?: typeof FoundryApplicationV2 } } };
  }
).foundry?.applications?.api?.ApplicationV2 ?? _TestSafeBase;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Data gathering — synchronous reads from local Foundry state
// ---------------------------------------------------------------------------

type SceneInfo = {
  id: string;
  name: string;
  tokenActors: Array<{ id: string; name: string; type: string }>;
  linkedJournalId: string | null;
  linkedJournalName: string | null;
};

type CombatInfo = {
  active: boolean;
  round: number;
  currentName: string;
  combatants: Array<{ name: string; initiative: number | null; defeated: boolean; hidden: boolean }>;
};

type ChatInfo = {
  messages: Array<{ speaker: string; excerpt: string; isWhisper: boolean }>;
};

type SessionInfo = {
  journalId: string | null;
  journalName: string;
  latestPageName: string | null;
  excerpt: string | null;
};

function _gatherScene(): SceneInfo | null {
  const scene = game.scenes.active;
  if (!scene) return null;
  const tokenActors = Array.from(scene.tokens)
    .filter((t) => Boolean(t.actorId))
    .slice(0, 12)
    .map((t) => ({
      id: t.actorId ?? "",
      name: t.name,
      type: (t.actor as { type?: string } | null | undefined)?.type ?? "",
    }));
  return {
    id: scene.id,
    name: scene.name,
    tokenActors,
    linkedJournalId: scene.journal?.id ?? null,
    linkedJournalName: scene.journal?.name ?? null,
  };
}

function _gatherCombat(): CombatInfo {
  const combat = game.combats.active;
  if (!combat?.started) {
    return { active: false, round: 0, currentName: "", combatants: [] };
  }
  return {
    active: true,
    round: combat.current.round ?? 1,
    currentName: combat.combatant?.name ?? "",
    combatants: combat.turns.map((c) => ({
      name: c.name,
      initiative: c.initiative ?? null,
      defeated: c.isDefeated,
      hidden: c.hidden,
    })),
  };
}

function _gatherChat(): ChatInfo {
  const recent = Array.from(game.messages).slice(-6);
  return {
    messages: recent.map((m) => ({
      speaker: m.speaker?.alias ?? m.author?.name ?? "Unknown",
      excerpt: m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90),
      isWhisper: m.whisper.length > 0,
    })),
  };
}

function _gatherSession(): SessionInfo {
  const settings = getLoreBridgeSettings();
  const folderName = settings.sessionLogFolder || "Session Logs";
  const journal = Array.from(game.journal).find((j) => j.name === folderName);
  if (!journal) return { journalId: null, journalName: folderName, latestPageName: null, excerpt: null };
  const pages = Array.from(journal.pages);
  const latest = pages[pages.length - 1];
  if (!latest) return { journalId: journal.id, journalName: journal.name, latestPageName: null, excerpt: null };
  const excerpt = (latest.text?.content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return { journalId: journal.id, journalName: journal.name, latestPageName: latest.name, excerpt };
}

// ---------------------------------------------------------------------------
// HTML section builders
// ---------------------------------------------------------------------------

function _sceneHtml(scene: SceneInfo | null): string {
  if (!scene) {
    return `<p class="lb-scc__empty">No active scene.</p>`;
  }
  const actorRows = scene.tokenActors.length > 0
    ? scene.tokenActors
        .map((a) =>
          `<span class="lb-scc__tag lb-scc__link" data-action="open-actor" data-id="${escHtml(a.id)}" title="Open actor sheet">${escHtml(a.name)}</span>`,
        )
        .join(" ")
    : `<em style="color:rgba(255,255,255,0.5)">No tokens</em>`;
  const journalLink = scene.linkedJournalId
    ? `<span class="lb-scc__link" data-action="open-journal" data-id="${escHtml(scene.linkedJournalId)}" title="Open linked journal">${escHtml(scene.linkedJournalName ?? "Linked Journal")}</span>`
    : `<em style="color:rgba(255,255,255,0.5)">None</em>`;
  return `
    <div class="lb-scc__row">
      <strong class="lb-scc__link" data-action="open-scene" title="Open scene sheet">${escHtml(scene.name)}</strong>
    </div>
    <div class="lb-scc__row"><span class="lb-scc__label">Tokens:</span> ${actorRows}</div>
    <div class="lb-scc__row"><span class="lb-scc__label">Journal:</span> ${journalLink}</div>`;
}

function _combatHtml(combat: CombatInfo): string {
  if (!combat.active) {
    return `<p class="lb-scc__empty">No active combat.</p>`;
  }
  const rows = combat.combatants
    .map((c) => {
      const cls = c.defeated ? "lb-scc__combatant--defeated" : "";
      const arrow = c.name === combat.currentName ? " ▶" : "";
      const init = c.initiative !== null ? String(c.initiative) : "—";
      return `<li class="${cls}">${escHtml(c.name)}${arrow} <span class="lb-scc__dim">(${init})</span></li>`;
    })
    .join("");
  return `
    <div class="lb-scc__row">
      <span class="lb-scc__label">Round ${combat.round}</span> · Current: <strong>${escHtml(combat.currentName)}</strong>
    </div>
    <ul class="lb-scc__list">${rows}</ul>`;
}

function _chatHtml(chat: ChatInfo): string {
  if (chat.messages.length === 0) {
    return `<p class="lb-scc__empty">No recent chat messages.</p>`;
  }
  const rows = chat.messages
    .map((m) => {
      const whisper = m.isWhisper ? ` <span class="lb-scc__dim">[whisper]</span>` : "";
      return `<li><strong>${escHtml(m.speaker)}</strong>${whisper}: ${escHtml(m.excerpt)}</li>`;
    })
    .join("");
  return `<ul class="lb-scc__list lb-scc__list--chat">${rows}</ul>`;
}

function _sessionHtml(session: SessionInfo): string {
  if (!session.journalId) {
    return `<p class="lb-scc__empty">Journal "<em>${escHtml(session.journalName)}</em>" not found.</p>`;
  }
  const label = session.latestPageName ?? session.journalName;
  const pageLink = `<span class="lb-scc__link" data-action="open-journal" data-id="${escHtml(session.journalId)}" title="Open session log">${escHtml(label)}</span>`;
  const excerptBlock = session.excerpt
    ? `<div class="lb-scc__excerpt">${escHtml(session.excerpt)}…</div>`
    : "";
  return `<div class="lb-scc__row">${pageLink}</div>${excerptBlock}`;
}

function _trackersHtml(): string {
  const trackers: Array<{ label: string; initAction: string; currentAction: string }> = [
    { label: "NPC Status", initAction: "tracker-npc-status-init", currentAction: "tracker-npc-status-current" },
    { label: "NPC Encounters", initAction: "tracker-npc-encounters-init", currentAction: "tracker-npc-encounters-current" },
    { label: "Quest Status", initAction: "tracker-quest-status-init", currentAction: "tracker-quest-status-current" },
    { label: "Region Visits", initAction: "tracker-region-visits-init", currentAction: "tracker-region-visits-current" },
  ];
  const rows = trackers
    .map(
      (t) =>
        `<tr>
          <td style="padding:3px 6px;font-size:11px;font-weight:bold;white-space:nowrap">${escHtml(t.label)}</td>
          <td style="padding:3px 2px"><button type="button" class="lb-scc__action-btn" data-action="${t.initAction}" title="Process all sessions (full initialize)">All</button></td>
          <td style="padding:3px 2px"><button type="button" class="lb-scc__action-btn" data-action="${t.currentAction}" title="Process only the latest session">Latest</button></td>
        </tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="color:rgba(255,255,255,0.45);font-size:10px">
      <th style="padding:2px 6px;text-align:left">Tracker</th>
      <th style="padding:2px">All</th>
      <th style="padding:2px">Latest</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _githubBackupsHtml(): string {
  const buttons = [
    `<button type="button" class="lb-scc__action-btn" data-action="backup-npcs" title="Backup all NPC actors to GitHub as Markdown"><i class="fas fa-dragon"></i> Actors (NPCs)</button>`,
    `<button type="button" class="lb-scc__action-btn" data-action="backup-players" title="Backup all player character actors to GitHub as Markdown"><i class="fas fa-user-shield"></i> Actors (Players)</button>`,
    `<button type="button" class="lb-scc__action-btn" data-action="backup-journals" title="Backup all non-Campaign-Codex journals to GitHub as Markdown"><i class="fas fa-book"></i> Journals</button>`,
    `<button type="button" class="lb-scc__action-btn" data-action="backup-macros" title="Backup all macros to GitHub as Markdown"><i class="fas fa-scroll"></i> Macros</button>`,
    `<button type="button" class="lb-scc__action-btn" data-action="backup-session-logs" title="Backup all Session Log pages to GitHub as Markdown"><i class="fas fa-clipboard-list"></i> Session Logs</button>`,
    `<button type="button" class="lb-scc__action-btn" data-action="cc-export" title="Export all Campaign Codex journal pages to GitHub"><i class="fas fa-book-open"></i> Export CC</button>`,
  ];
  return `<div class="lb-scc__actions">${buttons.join("")}</div>`;
}

function _actionsHtml(scene: SceneInfo | null): string {
  const settings = getLoreBridgeSettings();
  const buttons: string[] = [];

  if (scene) {
    buttons.push(
      `<button type="button" class="lb-scc__action-btn" data-action="open-scene" title="Open active scene sheet"><i class="fas fa-map"></i> Scene Sheet</button>`,
    );
  }
  buttons.push(
    `<button type="button" class="lb-scc__action-btn" data-action="add-session" title="Create a new session log page with the standard template"><i class="fas fa-book-medical"></i> Add Session</button>`,
  );
  buttons.push(
    `<button type="button" class="lb-scc__action-btn" data-action="health-check" title="Run campaign health check"><i class="fas fa-heartbeat"></i> Health Check</button>`,
  );
  if (settings.uiButtonsEnabled && scene) {
    buttons.push(
      `<button type="button" class="lb-scc__action-btn" data-action="encounter-suggestions" title="Suggest encounters for the active scene"><i class="fas fa-dice-d20"></i> Encounter Ideas</button>`,
    );
  }
  if (settings.chatCommandEnabled) {
    buttons.push(
      `<button type="button" class="lb-scc__action-btn" data-action="session-cleanup" title="Detect new entities from the session log"><i class="fas fa-broom"></i> Session Cleanup</button>`,
    );
  }
  buttons.push(
    `<button type="button" class="lb-scc__action-btn" data-action="match-portraits" title="Auto-match portrait images to NPC journals"><i class="fas fa-portrait"></i> Match Portraits</button>`,
  );
  buttons.push(
    `<button type="button" class="lb-scc__action-btn" data-action="sync-permissions" title="Set Observer on all encountered NPCs, visited regions, and active quests"><i class="fas fa-eye"></i> Sync Permissions</button>`,
  );
  buttons.push(
    `<button type="button" class="lb-scc__action-btn lb-scc__action-btn--danger" data-action="remove-all-players" title="Delete all Player and Trusted Player accounts"><i class="fas fa-user-minus"></i> Remove All Players…</button>`,
  );
  return buttons.length > 0
    ? `<div class="lb-scc__actions">${buttons.join("")}</div>`
    : `<p class="lb-scc__empty">All LoreBridge actions are currently disabled in settings.</p>`;
}

// ---------------------------------------------------------------------------
// Panel CSS (injected once)
// ---------------------------------------------------------------------------

const _CSS = `
.lorebridge-scc .window-content { padding: 0; overflow-y: auto; }
.lb-scc { padding: 6px 8px; font-size: 12px; line-height: 1.45; }
.lb-scc__toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.lb-scc__toolbar button { font-size: 11px; padding: 2px 8px; cursor: pointer; }
.lb-scc__ts { font-size: 10px; color: rgba(255,255,255,0.55); margin-left: auto; }
.lb-scc__section { margin-bottom: 4px; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; }
.lb-scc__section summary { cursor: pointer; padding: 4px 8px; font-weight: bold; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; background: rgba(255,255,255,0.06); user-select: none; }
.lb-scc__section > *:not(summary) { padding: 6px 8px; }
.lb-scc__row { margin-bottom: 3px; }
.lb-scc__label { color: rgba(255,255,255,0.55); font-size: 11px; }
.lb-scc__tag { display: inline-block; background: rgba(255,255,255,0.1); border-radius: 3px; padding: 1px 5px; margin: 1px; font-size: 11px; }
.lb-scc__link { cursor: pointer; color: #7ab5e8; text-decoration: underline; }
.lb-scc__link:hover { opacity: 0.8; }
.lb-scc__dim { color: rgba(255,255,255,0.4); font-size: 10px; }
.lb-scc__empty { color: rgba(255,255,255,0.5); font-style: italic; margin: 0; }
.lb-scc__list { margin: 2px 0; padding-left: 16px; }
.lb-scc__list--chat li { margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-scc__combatant--defeated { opacity: 0.4; text-decoration: line-through; }
.lb-scc__excerpt { margin-top: 4px; color: rgba(255,255,255,0.5); font-style: italic; font-size: 11px; }
.lb-scc__actions { display: flex; flex-wrap: wrap; gap: 4px; }
.lb-scc__action-btn { font-size: 11px; padding: 3px 8px; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; background: rgba(255,255,255,0.05); }
.lb-scc__action-btn:hover { background: rgba(255,255,255,0.12); }
.lb-scc__action-btn--danger { border-color: rgba(180,60,60,0.6); color: #cf8080; }
.lb-scc__action-btn--danger:hover { background: rgba(180,60,60,0.18); }
`.trim();

let _cssInjected = false;
function _injectCss(): void {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement("style");
  style.id = "lorebridge-scc-styles";
  style.textContent = _CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Session Command Center application
// ---------------------------------------------------------------------------

class SessionCommandCenter extends _AppBase {
  static override DEFAULT_OPTIONS = {
    id: "lorebridge-session-command-center",
    classes: ["lorebridge-scc"],
    window: { title: "LoreBridge — Session Command Center", resizable: true },
    position: { width: 720, height: 720 },
  };

  private _hookIds: number[] = [];
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;

  override async _renderHTML(
    _context: Record<string, unknown>,
    _options: unknown,
  ): Promise<HTMLElement> {
    _injectCss();

    if (!game.user?.isGM) {
      const el = document.createElement("div");
      el.style.padding = "1rem";
      el.textContent = "Session Command Center is only available to the GM.";
      return el;
    }

    const scene = _gatherScene();
    const combat = _gatherCombat();
    const chat = _gatherChat();
    const session = _gatherSession();
    const now = new Date().toLocaleTimeString();

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="lb-scc">
        <div class="lb-scc__toolbar">
          <button type="button" data-action="refresh"><i class="fas fa-sync-alt"></i> Refresh</button>
          <span class="lb-scc__ts">Updated ${escHtml(now)}</span>
        </div>

        <details class="lb-scc__section" open>
          <summary>📍 Active Scene</summary>
          ${_sceneHtml(scene)}
        </details>

        <details class="lb-scc__section" open>
          <summary>⚔️ Combat</summary>
          ${_combatHtml(combat)}
        </details>

        <details class="lb-scc__section">
          <summary>💬 Recent Chat</summary>
          ${_chatHtml(chat)}
        </details>

        <details class="lb-scc__section">
          <summary>📜 Session Log</summary>
          ${_sessionHtml(session)}
        </details>

        <details class="lb-scc__section">
          <summary>📊 Session Trackers</summary>
          ${_trackersHtml()}
        </details>

        <details class="lb-scc__section">
          <summary>📦 GitHub Backups</summary>
          ${_githubBackupsHtml()}
        </details>

        <details class="lb-scc__section" open>
          <summary>⚡ Quick Actions</summary>
          ${_actionsHtml(scene)}
        </details>
      </div>`;
    return container;
  }

  override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
    content.replaceChildren(...Array.from(result.childNodes));
  }

  override _onClickAction(event: PointerEvent, target: HTMLElement): void | Promise<void> {
    const action = target.dataset["action"];
    const id = target.dataset["id"] ?? "";

    if (action === "refresh") {
      void this.render();
      return;
    }
    if (action === "open-scene") {
      const scene = (game.scenes.active as { sheet?: { render(f: boolean): void } } | null);
      scene?.sheet?.render(true);
      return;
    }
    if (action === "open-actor") {
      const actor = (game.actors as { get(id: string): { sheet?: { render(f: boolean): void } } | undefined }).get(id);
      actor?.sheet?.render(true);
      return;
    }
    if (action === "open-journal") {
      const journal = (game.journal as { get(id: string): { sheet?: { render(f: boolean): void } } | undefined }).get(id);
      journal?.sheet?.render(true);
      return;
    }
    if (action === "encounter-suggestions") {
      void this._runEncounterSuggestions();
      return;
    }
    if (action === "health-check") {
      void this._runHealthCheck();
      return;
    }
    if (action === "session-cleanup") {
      void handleSessionCleanup("");
      return;
    }
    if (action === "remove-all-players") {
      void removeNonGmUsers().catch((err: unknown) => {
        ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Operation failed."}`);
      });
      return;
    }
    // Session tracker actions
    if (action === "tracker-npc-status-init") { void initializeNpcStatusTracker(); return; }
    if (action === "tracker-npc-status-current") { void updateNpcStatusFromLatest(); return; }
    if (action === "tracker-npc-encounters-init") { void initializeNpcEncounterTracker(); return; }
    if (action === "tracker-npc-encounters-current") { void updateNpcEncountersFromLatest(); return; }
    if (action === "tracker-quest-status-init") { void initializeQuestStatusTracker(); return; }
    if (action === "tracker-quest-status-current") { void updateQuestStatusFromLatest(); return; }
    if (action === "tracker-region-visits-init") { void initializeRegionVisitTracker(); return; }
    if (action === "tracker-region-visits-current") { void updateRegionVisitsFromLatest(); return; }
    // GitHub backup actions
    if (action === "backup-npcs") { void runBackupActorsNpcs(); return; }
    if (action === "backup-players") { void runBackupActorsPlayers(); return; }
    if (action === "backup-journals") { void runBackupJournals(); return; }
    if (action === "backup-macros") { void runBackupMacros(); return; }
    if (action === "backup-session-logs") { void runBackupSessionLogs(); return; }
    if (action === "cc-export") { void runExportCCJournals(); return; }
    if (action === "add-session") { void runCreateSessionLog(); return; }
    if (action === "match-portraits") { void matchPortraits(); return; }
    if (action === "sync-permissions") { void syncPermissions(); return; }
  }

  // -------------------------------------------------------------------------
  // Action implementations
  // -------------------------------------------------------------------------

  private async _runEncounterSuggestions(): Promise<void> {
    const scene = game.scenes.active;
    if (!scene) {
      ui.notifications.warn("LoreBridge: No active scene for encounter suggestions.");
      return;
    }
    ui.notifications.info("LoreBridge: Generating encounter suggestions…");
    try {
      const tokens = Array.from(scene.tokens).map((t) => t.name).filter(Boolean);
      const result = await postBackend<{ suggestions: string[] }>("v1/generate/encounter-suggestions", {
        sceneName: scene.name,
        linkedJournal: scene.journal?.name,
        tokens,
        tone: "neutral",
      });
      const listItems = result.suggestions
        .map((s, i) => `<p><strong>${i + 1}.</strong> ${s}</p>`)
        .join("\n");
      new foundry.applications.api.DialogV2({
        window: { title: `Encounter Ideas — ${scene.name}`, resizable: true },
        position: { width: 480, height: "auto" },
        content: `<div style="padding:0.5rem;font-size:0.9em">${listItems}</div>`,
        buttons: [{ action: "close", label: "Close", icon: "fas fa-times", default: true }],
      }).render({ force: true });
    } catch (error) {
      ui.notifications.error(`LoreBridge encounter suggestions failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async _runHealthCheck(): Promise<void> {
    ui.notifications.info("LoreBridge: Running campaign health check…");
    try {
      const result = await checkCampaignHealth({});
      const sevIcon = (s: string) => (s === "error" ? "🔴" : "⚠️");
      const rows = result.findings
        .map(
          (f) =>
            `<tr>
              <td style="padding:2px 6px">${sevIcon(f.severity)}</td>
              <td style="padding:2px 6px;font-size:11px;color:#888">${escHtml(f.category)}</td>
              <td style="padding:2px 6px">${escHtml(f.sourceName)}</td>
              <td style="padding:2px 6px;color:#444">${escHtml(f.detail)}</td>
            </tr>`,
        )
        .join("");
      const content =
        result.findings.length === 0
          ? `<p style="color:#27ae60;padding:0.5rem">✅ No issues found. Scanned ${result.documentsScanned} documents.</p>`
          : `<div style="overflow-y:auto;max-height:400px;font-size:12px">
              <p style="margin:4px 8px;color:#888">Scanned ${result.documentsScanned} documents</p>
              <table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>
            </div>`;
      new foundry.applications.api.DialogV2({
        window: { title: `Health Check — ${result.findings.length} finding(s)`, resizable: true },
        position: { width: 740, height: "auto" },
        content,
        buttons: [{ action: "close", label: "Close", default: true }],
      }).render({ force: true });
    } catch (error) {
      ui.notifications.error(`LoreBridge health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Reactive hooks
  // -------------------------------------------------------------------------

  _scheduleRefresh(): void {
    if (this._refreshTimer !== null) return;
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (this.rendered) void this.render();
    }, 1500);
  }

  _registerHooks(): void {
    const refresh = () => { this._scheduleRefresh(); };
    const onClose = (app: unknown) => {
      if ((app as { id?: string }).id === "lorebridge-feature-settings") {
        setTimeout(() => { if (this.rendered) void this.render(); }, 200);
      }
    };
    this._hookIds = [
      Hooks.on("updateScene", refresh),
      Hooks.on("canvasReady", refresh),
      Hooks.on("createCombat", refresh),
      Hooks.on("deleteCombat", refresh),
      Hooks.on("updateCombat", refresh),
      Hooks.on("updateCombatant", refresh),
      Hooks.on("createChatMessage", refresh),
      Hooks.on("closeApplication", onClose),
    ];
  }

  _unregisterHooks(): void {
    const hookNames = [
      "updateScene", "canvasReady", "createCombat", "deleteCombat",
      "updateCombat", "updateCombatant", "createChatMessage", "closeApplication",
    ];
    for (let i = 0; i < this._hookIds.length; i++) {
      const name = hookNames[i];
      const id = this._hookIds[i];
      if (name !== undefined && id !== undefined) Hooks.off(name, id);
    }
    this._hookIds = [];
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: SessionCommandCenter | null = null;

export function openSessionCommandCenter(): void {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: Session Command Center is only available to the GM.");
    return;
  }
  if (_instance?.rendered) {
    _instance.bringToFront();
    return;
  }
  _instance = new SessionCommandCenter();
  void _instance.render({ force: true }).then(() => {
    (_instance as SessionCommandCenter)._registerHooks();
  });

  // Clean up on window close
  const onCloseSelf = (app: unknown) => {
    if ((app as { id?: string }).id === "lorebridge-session-command-center") {
      (_instance as SessionCommandCenter | null)?._unregisterHooks();
      _instance = null;
      Hooks.off("closeApplication", onCloseSelf);
    }
  };
  Hooks.on("closeApplication", onCloseSelf);
}
