import { getLoreBridgeSettings } from "../settings.js";
import { escHtml } from "../utils/html.js";

const MODULE_ID = "lorebridge";

type ScannedEntity = { name: string; context: string };
type EntityRow = ScannedEntity & { type: string; selected: boolean };

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _rows: EntityRow[] = [];
let _cleanupPanel: SessionCleanupPanel | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _escAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

// Extract plain text from Foundry journal HTML, inserting spaces at block
// boundaries so words from adjacent paragraphs don't concatenate.
function _htmlToText(html: string): string {
  const spaced = html.replace(/<\/(p|h[1-6]|li|div|tr|td|th|blockquote)>/gi, " ");
  const doc = new DOMParser().parseFromString(spaced, "text/html");
  return doc.body.textContent ?? "";
}

function _buildPanelHtml(rows: EntityRow[]): string {
  const selectedCount = rows.filter((r) => r.selected).length;
  const typeOptions = ["NPC", "Location", "Faction", "Item", "Other"];

  if (rows.length === 0) {
    return `<div class="lb-cleanup lb-cleanup--empty">
      <p>No new entities detected in the session log.</p>
    </div>`;
  }

  const rowsHtml = rows
    .map(
      (r, i) => `
    <tr class="lb-cleanup__row ${r.selected ? "lb-cleanup__row--selected" : ""}">
      <td class="lb-cleanup__cell lb-cleanup__cell--check">
        <input type="checkbox" data-action="toggle" data-index="${i}" ${r.selected ? "checked" : ""}>
      </td>
      <td class="lb-cleanup__cell lb-cleanup__cell--name">${escHtml(r.name)}</td>
      <td class="lb-cleanup__cell lb-cleanup__cell--type">
        <select data-action="set-type" data-index="${i}">
          ${typeOptions.map((t) => `<option value="${t}" ${r.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </td>
      <td class="lb-cleanup__cell lb-cleanup__cell--context">${escHtml(r.context)}</td>
    </tr>`,
    )
    .join("");

  return `<style>
    /* Fill the ApplicationV2 content area so resize works naturally */
    .lorebridge-session-cleanup .window-content { display: flex; flex-direction: column; overflow: hidden; padding: 0; }
    .lb-cleanup { display: flex; flex-direction: column; gap: 6px; padding: 8px; height: 100%; box-sizing: border-box; min-height: 0; }
    .lb-cleanup__toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
    .lb-cleanup__count { margin-right: auto; font-weight: bold; }
    .lb-cleanup__table-wrap { flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--color-border-light, #999); border-radius: 4px; }
    .lb-cleanup__table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
    .lb-cleanup__table thead th { position: sticky; top: 0; background: var(--color-bg-header, #333); padding: 4px 6px; text-align: left; z-index: 1; }
    .lb-cleanup__table tbody tr:nth-child(even) { background: rgba(0,0,0,0.05); }
    .lb-cleanup__cell--check { width: 28px; text-align: center; }
    .lb-cleanup__cell--name { width: 140px; font-weight: 500; padding: 4px 6px; vertical-align: top; }
    .lb-cleanup__cell--type { width: 110px; padding: 4px 6px; vertical-align: top; }
    .lb-cleanup__cell--context { padding: 4px 6px; color: var(--color-text-dark-secondary, #aaa); font-style: italic; vertical-align: top; }
    .lb-cleanup__cell--type select { width: 100%; }
  </style>
  <div class="lb-cleanup">
    <div class="lb-cleanup__toolbar">
      <span class="lb-cleanup__count">${rows.length} candidate${rows.length !== 1 ? "s" : ""} found</span>
      <button type="button" data-action="select-all">Select All</button>
      <button type="button" data-action="select-none">Select None</button>
      <button type="button" data-action="create-stubs" ${selectedCount === 0 ? "disabled" : ""}>
        Create Stubs (${selectedCount})
      </button>
    </div>
    <div class="lb-cleanup__table-wrap">
      <table class="lb-cleanup__table">
        <thead>
          <tr>
            <th></th><th>Name</th><th>Type</th><th>Context</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// ApplicationV2 panel
// ---------------------------------------------------------------------------

const _AppV2Base = (
  foundry as { applications: { api: { ApplicationV2: typeof FoundryApplicationV2 } } }
).applications.api.ApplicationV2;

class SessionCleanupPanel extends _AppV2Base {
  static override DEFAULT_OPTIONS = {
    id: "lorebridge-session-cleanup",
    classes: ["lorebridge-session-cleanup"],
    window: { title: "LoreBridge — Session Cleanup", resizable: true },
    position: { width: 720, height: 560 },
  };

  override async _renderHTML(_context: Record<string, unknown>, _options: unknown): Promise<HTMLElement> {
    const container = document.createElement("div");
    container.innerHTML = _buildPanelHtml(_rows);
    // Wire up change events for checkboxes and selects since ApplicationV2
    // _onClickAction only fires on [data-action] clicks, not change events.
    container.querySelectorAll<HTMLInputElement>("input[data-action='toggle']").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset["index"]);
        if (_rows[idx]) _rows[idx].selected = el.checked;
        void this.render({ force: true });
      });
    });
    container.querySelectorAll<HTMLSelectElement>("select[data-action='set-type']").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset["index"]);
        if (_rows[idx]) _rows[idx].type = el.value;
      });
    });
    return container;
  }

  override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
    content.replaceChildren(...Array.from(result.childNodes));
  }

  override _onClickAction(_event: PointerEvent, target: HTMLElement): void | Promise<void> {
    const action = target.dataset["action"];
    if (action === "select-all") {
      _rows.forEach((r) => (r.selected = true));
      void this.render({ force: true });
    } else if (action === "select-none") {
      _rows.forEach((r) => (r.selected = false));
      void this.render({ force: true });
    } else if (action === "create-stubs") {
      return _doCreateStubs(this);
    }
  }
}

async function _doCreateStubs(panel: SessionCleanupPanel): Promise<void> {
  const selected = _rows.filter((r) => r.selected);
  if (selected.length === 0) return;

  const journalName = "Session Cleanup";
  let journal = Array.from(game.journal as FoundryJournalCollection).find(
    (j) => j.name === journalName,
  );
  if (!journal) {
    journal = await JournalEntry.create({ name: journalName, ownership: { default: 0 } });
    if (!journal) {
      ui.notifications.error("LoreBridge: Failed to create 'Session Cleanup' journal.");
      return;
    }
  }

  const pages = selected.map((r) => ({
    name: r.name,
    type: "text",
    text: {
      content: `<p><strong>Type:</strong> ${escHtml(r.type)}</p><p><strong>First seen:</strong> ${escHtml(r.context)}</p><p><em>Stub created by LoreBridge session cleanup. Fill in details here.</em></p>`,
      format: 1,
    },
    ownership: { default: 0 },
  }));

  await journal.createEmbeddedDocuments("JournalEntryPage", pages);

  ui.notifications.info(
    `LoreBridge: Created ${selected.length} stub page${selected.length !== 1 ? "s" : ""} in "${journalName}".`,
  );

  // Remove created rows and refresh or close.
  const selectedKeys = new Set(selected.map((r) => r.name.toLowerCase()));
  _rows = _rows.filter((r) => !selectedKeys.has(r.name.toLowerCase()));

  if (_rows.length === 0) {
    await panel.close();
    _cleanupPanel = null;
  } else {
    await panel.render({ force: true });
  }
}

// ---------------------------------------------------------------------------
// Entry point called from ui-chat.ts
// ---------------------------------------------------------------------------

export async function handleSessionCleanup(args: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb cleanup is only available to GMs.");
    return;
  }

  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    ui.notifications.error("LoreBridge: Backend is not configured or paired.");
    return;
  }

  ui.notifications.info("LoreBridge: Scanning session log for new entities…");

  // Find the target journal page.
  let targetContent: string | null = null;

  if (args.trim()) {
    // User provided a session name — search journals for a matching page.
    const query = args.trim().toLowerCase();
    outer: for (const journal of game.journal as FoundryJournalCollection) {
      for (const page of journal.pages) {
        if (page.name.toLowerCase().includes(query)) {
          targetContent = _htmlToText(page.text?.content ?? "");
          break outer;
        }
      }
    }
    if (targetContent === null) {
      ui.notifications.error(`LoreBridge: No session log page found matching "${args.trim()}".`);
      return;
    }
  } else {
    // Find most-recent session log page by inspecting the configured folder.
    const sessionFolderName =
      typeof settings.sessionLogFolder === "string" ? settings.sessionLogFolder.trim() : "";

    // Collect all pages across all journals, preferring those in the session log folder.
    type Candidate = { sort: number; content: string };
    const candidates: Candidate[] = [];

    for (const journal of game.journal as FoundryJournalCollection) {
      // Only look in the session log journal if one is configured.
      if (sessionFolderName && !journal.name.toLowerCase().includes(sessionFolderName.toLowerCase())) {
        continue;
      }
      for (const page of journal.pages) {
        if (/session\s*\d+/i.test(page.name)) {
          const text = _htmlToText(page.text?.content ?? "");
          if (text.trim()) candidates.push({ sort: page.sort, content: text });
        }
      }
    }

    if (candidates.length === 0) {
      // Fallback: any page with "session" in name across all journals.
      for (const journal of game.journal as FoundryJournalCollection) {
        for (const page of journal.pages) {
          if (/session/i.test(page.name)) {
            const text = _htmlToText(page.text?.content ?? "");
            if (text.trim()) candidates.push({ sort: page.sort, content: text });
          }
        }
      }
    }

    if (candidates.length === 0) {
      ui.notifications.error("LoreBridge: No session log page found. Use /lb cleanup <session name> to specify one.");
      return;
    }

    candidates.sort((a, b) => b.sort - a.sort);
    targetContent = candidates[0]!.content;
  }

  // Gather existing entity names.
  const existingNames: string[] = [];
  for (const actor of game.actors as FoundryActorCollection) existingNames.push(actor.name);
  for (const journal of game.journal as FoundryJournalCollection) existingNames.push(journal.name);
  for (const scene of game.scenes as FoundrySceneCollection) existingNames.push(scene.name);

  // Call backend.
  let entities: ScannedEntity[];
  try {
    const url = settings.backendUrl.endsWith("/")
      ? `${settings.backendUrl}v1/session/scan`
      : `${settings.backendUrl}/v1/session/scan`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.clientToken as string}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionContent: targetContent, existingNames }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
    }
    const data = (await response.json()) as { entities: ScannedEntity[] };
    entities = data.entities;
  } catch (error) {
    ui.notifications.error(
      `LoreBridge: Scan failed — ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (entities.length === 0) {
    ui.notifications.info("LoreBridge: No new entities detected in the session log.");
    return;
  }

  // Populate rows (default all selected, type NPC).
  _rows = entities.map((e) => ({ ...e, type: "NPC", selected: true }));

  if (!_cleanupPanel || !_cleanupPanel.rendered) {
    _cleanupPanel = new SessionCleanupPanel();
    await _cleanupPanel.render({ force: true });
  } else {
    await _cleanupPanel.render({ force: true });
    _cleanupPanel.bringToFront();
  }
}
