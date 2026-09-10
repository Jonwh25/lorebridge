/**
 * Campaign Timeline Tracker — issue #380
 *
 * Extracts major story events from session logs and maintains a chronological
 * timeline. Writes results to {lorefolderPath}/campaign_timeline.json.
 */

import { getLoreBridgeSettings } from "../settings.js";
import {
  readAll as sessionReadAll,
  readLatest as sessionReadLatest,
  extractFromSession,
  type SessionLogPage,
} from "./session-log-pipeline.js";
import { readLoreJson, writeLoreJson } from "../utils/foundry-io.js";
import {
  parseJsonFromAi,
  confirmDialog,
  showResultDialog,
  escHtml,
} from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimelineEventType =
  | "npc-death"
  | "quest-complete"
  | "quest-start"
  | "faction-shift"
  | "location-discovered"
  | "major-decision"
  | "item-acquired"
  | "notable-combat"
  | "other";

export type TimelineEvent = {
  session: number;
  realDate?: string;
  inWorldDate?: string;
  type: TimelineEventType;
  title: string;
  description: string;
  involvedActors?: string[];
  location?: string;
};

type AiTimelineEvent = {
  type?: string;
  title?: string;
  description?: string;
  inWorldDate?: string;
  involvedActors?: string[];
  location?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILENAME = "campaign_timeline.json";

const VALID_TYPES: TimelineEventType[] = [
  "npc-death",
  "quest-complete",
  "quest-start",
  "faction-shift",
  "location-discovered",
  "major-decision",
  "item-acquired",
  "notable-combat",
  "other",
];

const TYPE_LABELS: Record<TimelineEventType, string> = {
  "npc-death": "NPC Death",
  "quest-complete": "Quest Complete",
  "quest-start": "Quest Start",
  "faction-shift": "Faction Shift",
  "location-discovered": "Location Discovered",
  "major-decision": "Major Decision",
  "item-acquired": "Item Acquired",
  "notable-combat": "Notable Combat",
  other: "Other",
};

const TYPE_COLORS: Record<TimelineEventType, string> = {
  "npc-death": "#c88",
  "quest-complete": "#5dbb63",
  "quest-start": "#7ab5e8",
  "faction-shift": "#e88c00",
  "location-discovered": "#9b7ae8",
  "major-decision": "#f0c040",
  "item-acquired": "#5de8c8",
  "notable-combat": "#e85d5d",
  other: "#aaa",
};

const EXTRACT_PROMPT =
  `Extract major story events from this session log. Focus on significant moments only.
Return ONLY a JSON array of objects with this shape:
[{"type":"npc-death","title":"Short event title","description":"One-sentence description","inWorldDate":"(optional in-world date if mentioned)","involvedActors":["(optional actor names)"],"location":"(optional location name)"}]
Valid type values: npc-death, quest-complete, quest-start, faction-shift, location-discovered, major-decision, item-acquired, notable-combat, other.
If no major events found, return [].`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeType(raw: string | undefined): TimelineEventType {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, "-");
  return (VALID_TYPES as string[]).includes(s) ? (s as TimelineEventType) : "other";
}

function dedupeKey(event: TimelineEvent): string {
  return `${event.session}::${event.title.toLowerCase().trim()}`;
}

async function extractTimelineFromPage(page: SessionLogPage): Promise<AiTimelineEvent[]> {
  try {
    const raw = await extractFromSession(page.content, EXTRACT_PROMPT, page.pageId);
    const parsed = parseJsonFromAi<AiTimelineEvent[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) => typeof x.title === "string" && x.title.trim().length > 0,
    );
  } catch {
    return [];
  }
}

async function applyTimelineResults(
  events: TimelineEvent[],
  lorefolderPath: string,
): Promise<{ written: number }> {
  const existing = (await readLoreJson<TimelineEvent[]>(lorefolderPath, FILENAME)) ?? [];
  const merged = [...existing];
  const existingKeys = new Set(merged.map(dedupeKey));

  for (const event of events) {
    if (!existingKeys.has(dedupeKey(event))) {
      merged.push(event);
      existingKeys.add(dedupeKey(event));
    }
  }

  merged.sort((a, b) => a.session - b.session);
  await writeLoreJson(lorefolderPath, FILENAME, merged);
  return { written: events.length };
}

function buildEventsFromAi(
  aiEvents: AiTimelineEvent[],
  page: SessionLogPage,
): TimelineEvent[] {
  return aiEvents.map((e) => ({
    session: page.sessionNumber,
    ...(page.date ? { realDate: page.date } : {}),
    ...(e.inWorldDate ? { inWorldDate: e.inWorldDate } : {}),
    type: normalizeType(e.type),
    title: (e.title ?? "").trim(),
    description: (e.description ?? "").trim(),
    ...(Array.isArray(e.involvedActors) && e.involvedActors.length > 0
      ? { involvedActors: e.involvedActors.filter((a): a is string => typeof a === "string") }
      : {}),
    ...(e.location ? { location: e.location } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Preview dialog
// ---------------------------------------------------------------------------

async function showTimelinePreview(
  events: TimelineEvent[],
  sessionLabel: string,
): Promise<TimelineEvent[] | null> {
  const rowsHtml = events
    .map(
      (e) =>
        `<tr>
          <td style="padding:3px 6px;color:${TYPE_COLORS[e.type]};white-space:nowrap;font-size:0.8em">${escHtml(TYPE_LABELS[e.type])}</td>
          <td style="padding:3px 6px;font-weight:bold">${escHtml(e.title)}</td>
          <td style="padding:3px 6px;font-size:0.8em;color:#aaa">${escHtml(e.description)}</td>
        </tr>`,
    )
    .join("");

  const confirmed = await confirmDialog(
    `Campaign Timeline — ${sessionLabel}`,
    `<p>Detected <strong>${events.length}</strong> timeline event(s):</p>
     <div style="max-height:300px;overflow-y:auto">
       <table style="width:100%;border-collapse:collapse;font-size:0.85em">
         <thead><tr style="color:#888;text-align:left">
           <th style="padding:3px 6px">Type</th>
           <th style="padding:3px 6px">Title</th>
           <th style="padding:3px 6px">Description</th>
         </tr></thead>
         <tbody>${rowsHtml}</tbody>
       </table>
     </div>`,
  );

  return confirmed ? events : null;
}

// ---------------------------------------------------------------------------
// Timeline viewer dialog (ApplicationV2)
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

class TimelineViewerApp extends _AppBase {
  static override DEFAULT_OPTIONS = {
    id: "lorebridge-timeline-viewer",
    window: { title: "Campaign Timeline", resizable: true },
    position: { width: 700, height: 560 },
    actions: {},
  };

  override async _renderHTML(
    _context: Record<string, unknown>,
    _options: unknown,
  ): Promise<HTMLElement> {
    const settings = getLoreBridgeSettings();
    const events = (await readLoreJson<TimelineEvent[]>(settings.lorefolderPath, FILENAME)) ?? [];

    const container = document.createElement("div");
    container.innerHTML = _buildViewerHtml(events);
    _wireFilters(container, events);
    return container;
  }

  override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
    content.replaceChildren(...Array.from(result.childNodes));
  }
}

function _buildViewerHtml(events: TimelineEvent[]): string {
  if (events.length === 0) {
    return `<div style="padding:1rem;color:#aaa;text-align:center">
      No timeline events yet. Use the Campaign Timeline tracker in the Session Command Center to extract events.
    </div>`;
  }

  const typeOptions = VALID_TYPES.map(
    (t) => `<option value="${t}">${escHtml(TYPE_LABELS[t])}</option>`,
  ).join("");

  const eventCards = events
    .map((e) => _buildEventCard(e))
    .join("");

  return `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div style="padding:0.5rem 0.75rem;border-bottom:1px solid #444;display:flex;gap:0.5rem;align-items:center;flex-shrink:0">
      <label style="font-size:0.85em;color:#aaa">Filter by type:</label>
      <select id="lb-tl-type-filter" style="padding:2px 6px;background:#222;color:#eee;border:1px solid #555;border-radius:3px;font-size:0.85em">
        <option value="">All types</option>
        ${typeOptions}
      </select>
      <span id="lb-tl-count" style="font-size:0.8em;color:#888;margin-left:auto">${events.length} event(s)</span>
    </div>
    <div id="lb-tl-events" style="flex:1;overflow-y:auto;padding:0.5rem 0.75rem">
      ${eventCards}
    </div>
  </div>`;
}

function _buildEventCard(e: TimelineEvent): string {
  const color = TYPE_COLORS[e.type];
  const typeLabel = TYPE_LABELS[e.type];
  const actors = e.involvedActors && e.involvedActors.length > 0
    ? `<span style="color:#aaa;font-size:0.75em">👤 ${e.involvedActors.map(escHtml).join(", ")}</span>`
    : "";
  const location = e.location
    ? `<span style="color:#aaa;font-size:0.75em">📍 ${escHtml(e.location)}</span>`
    : "";
  const dateStr = e.inWorldDate
    ? `<span style="color:#888;font-size:0.75em">${escHtml(e.inWorldDate)}</span>`
    : e.realDate
    ? `<span style="color:#888;font-size:0.75em">${escHtml(e.realDate)}</span>`
    : "";

  return `<div class="lb-tl-card" data-type="${e.type}" data-session="${e.session}"
    style="margin-bottom:0.5rem;padding:0.5rem 0.75rem;background:#1a1a1a;border-left:3px solid ${color};border-radius:3px">
    <div style="display:flex;gap:0.5rem;align-items:baseline;flex-wrap:wrap;margin-bottom:0.25rem">
      <span style="font-size:0.7em;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:0.05em">${escHtml(typeLabel)}</span>
      <span style="font-weight:bold;font-size:0.9em">${escHtml(e.title)}</span>
      <span style="font-size:0.75em;color:#666;margin-left:auto">Session ${e.session}</span>
    </div>
    <div style="font-size:0.85em;color:#ccc;margin-bottom:0.25rem">${escHtml(e.description)}</div>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">${actors}${location}${dateStr}</div>
  </div>`;
}

function _wireFilters(container: HTMLElement, allEvents: TimelineEvent[]): void {
  const typeSelect = container.querySelector<HTMLSelectElement>("#lb-tl-type-filter");
  const eventsDiv = container.querySelector<HTMLElement>("#lb-tl-events");
  const countSpan = container.querySelector<HTMLElement>("#lb-tl-count");
  if (!typeSelect || !eventsDiv) return;

  typeSelect.addEventListener("change", () => {
    const typeVal = typeSelect.value;
    const filtered = typeVal ? allEvents.filter((e) => e.type === typeVal) : allEvents;
    eventsDiv.innerHTML = filtered.map(_buildEventCard).join("");
    if (countSpan) countSpan.textContent = `${filtered.length} event(s)`;
  });
}

// Singleton reference so we can re-use the window
let _viewerInstance: TimelineViewerApp | null = null;

export async function openTimelineViewer(): Promise<void> {
  if (!game.user?.isGM) return;
  if (!_viewerInstance || !_viewerInstance.rendered) {
    _viewerInstance = new TimelineViewerApp();
  }
  await _viewerInstance.render({ force: true });
  _viewerInstance.bringToFront();
}

// ---------------------------------------------------------------------------
// Public UI entry points
// ---------------------------------------------------------------------------

/** Initialize: process ALL session log pages. */
export async function initializeTimelineTracker(): Promise<void> {
  if (!game.user?.isGM) return;

  const pages = sessionReadAll();
  if (pages.length === 0) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  const confirmed = await confirmDialog(
    "Campaign Timeline — Initialize",
    `<p>This will process <strong>${pages.length}</strong> session log page(s) using AI to extract major campaign events.</p>
     <p style="color:#aaa;font-size:0.85em">Detected events will be shown for review before being applied.</p>`,
  );
  if (!confirmed) return;

  ui.notifications.info("LoreBridge Campaign Timeline: Processing sessions…");

  const allEvents: TimelineEvent[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const aiEvents = await extractTimelineFromPage(page);
    for (const event of buildEventsFromAi(aiEvents, page)) {
      const key = dedupeKey(event);
      if (!seenKeys.has(key)) {
        allEvents.push(event);
        seenKeys.add(key);
      }
    }
    if ((i + 1) % 5 === 0 || i === pages.length - 1) {
      ui.notifications.info(
        `LoreBridge Campaign Timeline: processed ${i + 1} of ${pages.length} sessions…`,
      );
    }
  }

  if (allEvents.length === 0) {
    ui.notifications.info("LoreBridge Campaign Timeline: No events detected.");
    return;
  }

  const approved = await showTimelinePreview(allEvents, `All ${pages.length} sessions`);
  if (!approved) return;

  const settings = getLoreBridgeSettings();
  const { written } = await applyTimelineResults(approved, settings.lorefolderPath);

  showResultDialog(
    "Campaign Timeline — Complete",
    `<p>✅ Added <strong>${written}</strong> timeline event(s) from ${pages.length} session(s).</p>`,
  );
}

/** Current: process only the latest session log page. */
export async function updateTimelineFromLatest(): Promise<void> {
  if (!game.user?.isGM) return;

  const page = sessionReadLatest();
  if (!page) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  ui.notifications.info(`LoreBridge Campaign Timeline: Analyzing session ${page.sessionNumber}…`);

  const aiEvents = await extractTimelineFromPage(page);
  if (aiEvents.length === 0) {
    ui.notifications.info("LoreBridge Campaign Timeline: No events detected in the latest session.");
    return;
  }

  const events = buildEventsFromAi(aiEvents, page);
  const approved = await showTimelinePreview(events, `Session ${page.sessionNumber}`);
  if (!approved) return;

  const settings = getLoreBridgeSettings();
  const { written } = await applyTimelineResults(approved, settings.lorefolderPath);

  showResultDialog(
    "Campaign Timeline — Complete",
    `<p>✅ Added <strong>${written}</strong> event(s) from session ${page.sessionNumber}.</p>`,
  );
}
