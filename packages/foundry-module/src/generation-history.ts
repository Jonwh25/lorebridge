const MODULE_ID = "lorebridge";
const HISTORY_SETTING = "generationHistory";
const MAX_LENGTH_SETTING = "maxHistoryLength";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GenerationEntryType =
  | "npc-profile"
  | "npc-statblock"
  | "room-description"
  | "session-recap"
  | "party-recap"
  | "session-prep"
  | "encounter-suggestions"
  | "journal-qa"
  | "chat"
  | "npc-location"
  | "city-description";

const ENTRY_TYPE_LABELS: Record<GenerationEntryType, string> = {
  "npc-profile": "NPC Profile",
  "npc-statblock": "NPC Stat Block",
  "room-description": "Room Description",
  "session-recap": "Session Recap",
  "party-recap": "Party Recap",
  "session-prep": "Session Prep",
  "encounter-suggestions": "Encounter Suggestions",
  "journal-qa": "Journal Q&A",
  "chat": "Q&A",
  "npc-location": "Location NPCs",
  "city-description": "City Description",
};

export interface GenerationHistoryEntry {
  id: string;
  type: GenerationEntryType;
  timestamp: number;
  /** Human-readable title, e.g. "NPC Profile — Strahd von Zarovich" */
  label: string;
  /** What was requested, e.g. "Tone: gothic, Length: medium" */
  prompt: string;
  /** The generated text content */
  content: string;
}

// ---------------------------------------------------------------------------
// Storage (game.settings, world scope, JSON string)
// ---------------------------------------------------------------------------

function readRawEntries(): GenerationHistoryEntry[] {
  try {
    const raw = String(game.settings.get(MODULE_ID, HISTORY_SETTING) ?? "[]");
    return JSON.parse(raw) as GenerationHistoryEntry[];
  } catch {
    return [];
  }
}

async function writeEntries(entries: GenerationHistoryEntry[]): Promise<void> {
  await (game.settings as unknown as { set(m: string, k: string, v: unknown): Promise<unknown> })
    .set(MODULE_ID, HISTORY_SETTING, JSON.stringify(entries));
}

function getMaxLength(): number {
  try {
    return Math.max(1, Number(game.settings.get(MODULE_ID, MAX_LENGTH_SETTING) ?? 10));
  } catch {
    return 10;
  }
}

export function getHistoryEntries(): GenerationHistoryEntry[] {
  return readRawEntries();
}

export async function addHistoryEntry(
  entry: Omit<GenerationHistoryEntry, "id" | "timestamp">,
): Promise<void> {
  const existing = readRawEntries();
  const newEntry: GenerationHistoryEntry = {
    id: foundry.utils.randomID(),
    timestamp: Date.now(),
    ...entry,
  };
  const pruned = [newEntry, ...existing].slice(0, getMaxLength());
  await writeEntries(pruned);
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await writeEntries(readRawEntries().filter((e) => e.id !== id));
}

export async function clearHistory(): Promise<void> {
  await writeEntries([]);
}

// ---------------------------------------------------------------------------
// Panel HTML
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildHistorySectionHtml(entries: GenerationHistoryEntry[]): string {
  const style = `
    <style>
      #lorebridge-generation-history .window-content {
        overflow-y: auto;
        padding: 0;
      }
      .lb-history-list { padding: 8px; }
    </style>`;

  if (entries.length === 0) {
    return `${style}<div class="lb-history-list">
      <p style="color:#888;text-align:center;padding:24px 0;">
        No generation history yet.<br>
        <small>Generations from NPC Quick-Gen, Describe Room, Session Recap, and other tools will appear here.</small>
      </p>
    </div>`;
  }

  const rows = entries.map((e) => {
    const typeLabel = esc(ENTRY_TYPE_LABELS[e.type] ?? e.type);
    const preview = esc(e.content.slice(0, 120).replace(/\n/g, " "));
    const hasMore = e.content.length > 120;
    return `
      <div style="border:1px solid #444;border-radius:4px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
          <span style="font-weight:bold;font-size:0.95em;">${esc(e.label)}</span>
          <span style="font-size:0.75em;color:#888;white-space:nowrap;margin-left:8px;">${formatDate(e.timestamp)}</span>
        </div>
        <div style="margin-bottom:4px;">
          <span style="display:inline-block;background:#2a3a4a;color:#7ab;border-radius:3px;padding:1px 6px;font-size:0.75em;margin-right:6px;">${typeLabel}</span>
          <span style="font-size:0.8em;color:#aaa;">${esc(e.prompt)}</span>
        </div>
        <div style="font-size:0.82em;color:#bbb;font-style:italic;margin-bottom:8px;">${preview}${hasMore ? "…" : ""}</div>
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button data-action="history-delete" data-entry-id="${esc(e.id)}"
            style="padding:3px 10px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a;border-radius:3px;cursor:pointer;font-size:0.82em;">
            <i class="fas fa-trash"></i> Delete
          </button>
          <button data-action="history-reopen" data-entry-id="${esc(e.id)}"
            style="padding:3px 10px;background:#1a2a3a;color:#7ab;border:1px solid #3a5a7a;border-radius:3px;cursor:pointer;font-size:0.82em;">
            <i class="fas fa-eye"></i> Reopen
          </button>
        </div>
      </div>`;
  }).join("");

  return `${style}<div class="lb-history-list">
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
      <button data-action="history-clear-all"
        style="padding:4px 12px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a;border-radius:3px;cursor:pointer;font-size:0.82em;">
        <i class="fas fa-trash-alt"></i> Clear All
      </button>
    </div>
    ${rows}
  </div>`;
}

// ---------------------------------------------------------------------------
// Panel (ApplicationV2)
// ---------------------------------------------------------------------------

const _StubBase: typeof FoundryApplicationV2 = class {
  static DEFAULT_OPTIONS = {};
  readonly element: HTMLElement = document.createElement("div");
  rendered = false;
  bringToFront(): void { return; }
  async render(_opts?: unknown): Promise<this> { return this; }
  async close(_opts?: unknown): Promise<this> { return this; }
  _onClickAction(_e: PointerEvent, _t: HTMLElement): void { return; }
  _renderHTML(_ctx: Record<string, unknown>, _opts: unknown): Promise<HTMLElement> { return Promise.resolve(document.createElement("div")); }
  _replaceHTML(_r: HTMLElement, _c: HTMLElement, _opts: unknown): void { return; }
} as unknown as typeof FoundryApplicationV2;

const _AppV2Base: typeof FoundryApplicationV2 = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: { ApplicationV2?: typeof FoundryApplicationV2 } } };
  }
).foundry?.applications?.api?.ApplicationV2 ?? _StubBase;

let _panel: GenerationHistoryPanel | null = null;

export class GenerationHistoryPanel extends _AppV2Base {
  static override DEFAULT_OPTIONS = {
    id: "lorebridge-generation-history",
    classes: ["lorebridge-generation-history"],
    window: { title: "LoreBridge — Generation History", resizable: true },
    position: { width: 580, height: 540 },
  };

  override async _renderHTML(_context: Record<string, unknown>, _options: unknown): Promise<HTMLElement> {
    const container = document.createElement("div");
    container.innerHTML = buildHistorySectionHtml(getHistoryEntries());
    return container;
  }

  override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
    content.replaceChildren(...Array.from(result.childNodes));
  }

  override _onClickAction(_event: PointerEvent, target: HTMLElement): void | Promise<void> {
    const action = target.dataset["action"];
    const id = target.dataset["entryId"] ?? "";
    if (action === "history-reopen") return _doReopen(id);
    if (action === "history-delete") return _doDelete(id, this);
    if (action === "history-clear-all") return _doClearAll(this);
  }
}

function _doReopen(id: string): void {
  const entry = getHistoryEntries().find((e) => e.id === id);
  if (!entry) return;

  const clean = entry.content
    .replace(/\|/g, "")
    .replace(/^\s*[-#]+\s*/gm, "")
    .trim();
  const escaped = esc(clean);
  const content = `
    <div style="padding:0.5rem;max-height:420px;overflow-y:auto;font-size:0.9em">
      <p style="color:#888;font-size:0.82em;margin-bottom:0.5rem;">
        ${esc(ENTRY_TYPE_LABELS[entry.type] ?? entry.type)} &mdash; ${formatDate(entry.timestamp)}<br>
        <em>${esc(entry.prompt)}</em>
      </p>
      <hr>
      <p>${escaped.replace(/\n/g, "<br>")}</p>
    </div>`;

  new foundry.applications.api.DialogV2({
    window: { title: entry.label, resizable: true },
    position: { width: 540, height: "auto" },
    content,
    buttons: [
      {
        action: "copy",
        label: "Copy to Clipboard",
        icon: "fas fa-copy",
        callback: () => {
          void navigator.clipboard.writeText(entry.content).then(() => {
            ui.notifications.info("LoreBridge: Copied to clipboard.");
          });
        },
      },
      {
        action: "close",
        label: "Close",
        icon: "fas fa-times",
        default: true,
      },
    ],
  }).render({ force: true });
}

async function _doDelete(id: string, panel: GenerationHistoryPanel): Promise<void> {
  await deleteHistoryEntry(id);
  await panel.render({ force: false });
}

async function _doClearAll(panel: GenerationHistoryPanel): Promise<void> {
  await clearHistory();
  await panel.render({ force: false });
}

export function openGenerationHistory(): void {
  if (!_panel) _panel = new GenerationHistoryPanel();
  void _panel.render({ force: true });
}
