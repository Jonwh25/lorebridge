/**
 * Region Visit Tracker — issue #273
 *
 * Tracks which named regions/locations the party has visited across sessions.
 * Writes results to {lorefolderPath}/region_visits.json.
 * Sets Observer ownership on matching Campaign Codex region journals.
 */

import { getLoreBridgeSettings } from "../settings.js";
import {
  readAll as sessionReadAll,
  readLatest as sessionReadLatest,
  extractFromSession,
  type SessionLogPage,
} from "./session-log-reader.js";
import {
  readLoreJson,
  writeLoreJson,
  backupLoreFile,
  getJournalsInFolder,
  findMatchingJournal,
  parseJsonFromAi,
  confirmDialog,
  showResultDialog,
  escHtml,
  latestSessionNumber,
  type JournalWithOps,
} from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegionVisitEntry = {
  name: string;
  visited: boolean;
  sessions: number[];
  firstSeen: number;
};

const FILENAME = "region_visits.json";
const CC_FOLDER = "Campaign Codex - Regions";

const EXTRACT_PROMPT =
  `List all named regions, locations, towns, cities, dungeons, or places the party visited or traveled to in this session log. Return ONLY a JSON array of location name strings. Exclude vague references like "the road" or "nearby". If no named locations found, return []. Format: ["Location Name 1", "Location Name 2"]`;

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

async function extractRegionsFromPage(page: SessionLogPage): Promise<string[]> {
  try {
    const raw = await extractFromSession(page.content, EXTRACT_PROMPT, page.pageId);
    const parsed = parseJsonFromAi<string[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string" && x.trim().length > 1);
  } catch {
    return [];
  }
}

async function setObserverOwnership(journal: JournalWithOps): Promise<void> {
  const ownership = (journal.ownership as Record<string, number> | undefined) ?? {};
  await journal.update({ ownership: { ...ownership, default: 2 } });
}

async function applyRegionVisits(
  visitedNames: string[],
  sessionNumber: number,
  lorefolderPath: string,
): Promise<{ added: number; updated: number; journalsUpdated: number; journalsMissing: string[] }> {
  const existing = (await readLoreJson<RegionVisitEntry[]>(lorefolderPath, FILENAME)) ?? [];
  const merged = [...existing];

  let added = 0;
  let updated = 0;

  for (const name of visitedNames) {
    const idx = merged.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      const entry = merged[idx]!;
      if (!entry.sessions.includes(sessionNumber)) {
        merged[idx] = { ...entry, sessions: [...entry.sessions, sessionNumber].sort((a, b) => a - b), visited: true };
        updated++;
      }
    } else {
      merged.push({ name, visited: true, sessions: [sessionNumber], firstSeen: sessionNumber });
      added++;
    }
  }

  await writeLoreJson(lorefolderPath, FILENAME, merged);

  // Set Observer on newly seen regions only (added)
  const ccJournals = getJournalsInFolder(CC_FOLDER);
  let journalsUpdated = 0;
  const journalsMissing: string[] = [];

  const newNames = visitedNames.filter(
    (name) => !existing.some((e) => e.name.toLowerCase() === name.toLowerCase()),
  );

  for (const name of newNames) {
    const journal = findMatchingJournal(name, ccJournals);
    if (journal) {
      await setObserverOwnership(journal);
      journalsUpdated++;
    } else {
      journalsMissing.push(name);
    }
  }

  if (journalsMissing.length > 0) {
    console.info(
      `LoreBridge Region Visits: No matching journal for: ${journalsMissing.join(", ")}`,
    );
  }

  return { added, updated, journalsUpdated, journalsMissing };
}

// ---------------------------------------------------------------------------
// Public UI entry points
// ---------------------------------------------------------------------------

/** Initialize: process ALL session log pages. */
export async function initializeRegionVisitTracker(): Promise<void> {
  if (!game.user?.isGM) return;

  const pages = sessionReadAll();
  if (pages.length === 0) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  const confirmed = await confirmDialog(
    "Region Visit Tracker — Initialize",
    `<p>This will process <strong>${pages.length}</strong> session log page(s) using AI to identify all regions visited.</p>
     <p style="color:#aaa;font-size:0.85em">Observer will be set on newly discovered Campaign Codex region journals.</p>`,
  );
  if (!confirmed) return;

  ui.notifications.info("LoreBridge Region Visits: Processing sessions…");

  // Collect per-session visits to preserve session numbers
  const visitsBySession = new Map<number, Set<string>>();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const names = await extractRegionsFromPage(page);
    if (names.length > 0) {
      const existing = visitsBySession.get(page.sessionNumber) ?? new Set<string>();
      for (const n of names) existing.add(n.trim());
      visitsBySession.set(page.sessionNumber, existing);
    }
    if ((i + 1) % 5 === 0 || i === pages.length - 1) {
      ui.notifications.info(
        `LoreBridge Region Visits: processed ${i + 1} of ${pages.length} sessions…`,
      );
    }
  }

  if (visitsBySession.size === 0) {
    ui.notifications.info("LoreBridge Region Visits: No named regions detected.");
    return;
  }

  const settings = getLoreBridgeSettings();
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalJournals = 0;
  const allMissing: string[] = [];

  for (const [sessionNum, names] of [...visitsBySession.entries()].sort(([a], [b]) => a - b)) {
    const { added, updated, journalsUpdated, journalsMissing } = await applyRegionVisits(
      [...names],
      sessionNum,
      settings.lorefolderPath,
    );
    totalAdded += added;
    totalUpdated += updated;
    totalJournals += journalsUpdated;
    allMissing.push(...journalsMissing);
  }

  const uniqueMissing = [...new Set(allMissing)];
  const missingHtml =
    uniqueMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${uniqueMissing.slice(0, 20).map(escHtml).join(", ")}${uniqueMissing.length > 20 ? ` + ${uniqueMissing.length - 20} more` : ""}</p>`
      : "";

  showResultDialog(
    "Region Visits — Complete",
    `<p>✅ Added <strong>${totalAdded}</strong> new region(s).</p>
     <p>🔄 Updated visit history for <strong>${totalUpdated}</strong> existing region(s).</p>
     <p>🔑 Set Observer on <strong>${totalJournals}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

/** Current: process only the latest session log page. */
export async function updateRegionVisitsFromLatest(): Promise<void> {
  if (!game.user?.isGM) return;

  const page = sessionReadLatest();
  if (!page) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  ui.notifications.info(`LoreBridge Region Visits: Analyzing session ${page.sessionNumber}…`);

  const names = await extractRegionsFromPage(page);
  if (names.length === 0) {
    ui.notifications.info("LoreBridge Region Visits: No named regions detected in the latest session.");
    return;
  }

  const confirmed = await confirmDialog(
    `Region Visits — Session ${page.sessionNumber}`,
    `<p>Detected <strong>${names.length}</strong> region(s) in session ${page.sessionNumber}:</p>
     <ul style="max-height:200px;overflow-y:auto;font-size:0.85em">${names.map((n) => `<li>${escHtml(n)}</li>`).join("")}</ul>
     <p style="color:#aaa;font-size:0.85em">Observer will be set on newly discovered region journals.</p>`,
  );
  if (!confirmed) return;

  const settings = getLoreBridgeSettings();
  const { added, updated, journalsUpdated, journalsMissing } = await applyRegionVisits(
    names,
    page.sessionNumber,
    settings.lorefolderPath,
  );

  const missingHtml =
    journalsMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${journalsMissing.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "Region Visits — Complete",
    `<p>✅ Added <strong>${added}</strong> new region(s) from session ${page.sessionNumber}.</p>
     <p>🔄 Updated visit history for <strong>${updated}</strong> existing region(s).</p>
     <p>🔑 Set Observer on <strong>${journalsUpdated}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

/** Backup: commit region_visits.json to GitHub. */
export async function backupRegionVisits(): Promise<void> {
  if (!game.user?.isGM) return;
  try {
    ui.notifications.info("LoreBridge Region Visits: Backing up to GitHub…");
    const settings = getLoreBridgeSettings();
    const sessionNum = latestSessionNumber();
    await backupLoreFile(
      settings.lorefolderPath,
      FILENAME,
      `LoreBridge: Region Visits backup — Session ${sessionNum}`,
    );
    ui.notifications.info("LoreBridge Region Visits: Backup complete.");
  } catch (err) {
    ui.notifications.error(
      `LoreBridge Region Visits backup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
