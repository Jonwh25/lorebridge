/**
 * NPC Encounter Tracker — issue #271
 *
 * Tracks every named NPC the party has encountered across all sessions.
 * Writes results to {lorefolderPath}/encountered_npcs.json.
 * Sets Observer ownership (default=2) on matching Campaign Codex NPC journals.
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

const FILENAME = "encountered_npcs.json";
const CC_FOLDER = "Campaign Codex - NPCs";

const GENERIC_NPCS = new Set([
  "guard", "guards", "villager", "villagers", "innkeeper", "merchant",
  "peasant", "peasants", "soldier", "soldiers", "bandit", "bandits",
  "servant", "servants", "citizen", "citizens", "traveler", "travelers",
  "farmer", "farmers", "knight", "knights", "priest", "priests",
  "wizard", "man", "woman", "child", "children", "person", "people",
]);

function buildExtractPrompt(playerNames: string[]): string {
  const exclusionNote =
    playerNames.length > 0
      ? ` Exclude these player characters: ${playerNames.join(", ")}.`
      : "";
  return `List all named NPCs encountered or interacted with by the party in this session log.${exclusionNote} Exclude generic unnamed roles like guard, villager, innkeeper. Return ONLY a JSON array of unique NPC name strings. If no NPCs found, return []. Format: ["Name1", "Name2"]`;
}

function getPlayerNames(): string[] {
  const raw = getLoreBridgeSettings().playerCharacterNames;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isGenericOrPlayer(name: string, playerNames: string[]): boolean {
  const lower = name.toLowerCase().trim();
  if (GENERIC_NPCS.has(lower)) return true;
  if (playerNames.includes(lower)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

async function extractEncountersFromPage(
  page: SessionLogPage,
  prompt: string,
): Promise<string[]> {
  try {
    const raw = await extractFromSession(page.content, prompt, page.pageId);
    const parsed = parseJsonFromAi<string[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

async function setObserverOwnership(journal: JournalWithOps): Promise<void> {
  const ownership = (journal.ownership as Record<string, number> | undefined) ?? {};
  await journal.update({ ownership: { ...ownership, default: 2 } });
}

async function applyEncounters(
  newNames: string[],
  lorefolderPath: string,
): Promise<{ added: number; alreadyKnown: number; journalsUpdated: number; journalsMissing: string[] }> {
  const existing = (await readLoreJson<string[]>(lorefolderPath, FILENAME)) ?? [];
  const existingSet = new Set(existing.map((n) => n.toLowerCase()));

  const truly_new: string[] = [];
  for (const name of newNames) {
    if (!existingSet.has(name.toLowerCase())) {
      truly_new.push(name);
      existingSet.add(name.toLowerCase());
    }
  }

  const merged = [...existing, ...truly_new];
  await writeLoreJson(lorefolderPath, FILENAME, merged);

  // Set Observer on matching CC NPC journals
  const ccJournals = getJournalsInFolder(CC_FOLDER);
  let journalsUpdated = 0;
  const journalsMissing: string[] = [];

  for (const name of truly_new) {
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
      `LoreBridge NPC Encounters: No matching journal for: ${journalsMissing.join(", ")}`,
    );
  }

  return {
    added: truly_new.length,
    alreadyKnown: newNames.length - truly_new.length,
    journalsUpdated,
    journalsMissing,
  };
}

// ---------------------------------------------------------------------------
// Public UI entry points
// ---------------------------------------------------------------------------

/** Initialize: process ALL session log pages. */
export async function initializeNpcEncounterTracker(): Promise<void> {
  if (!game.user?.isGM) return;

  const pages = sessionReadAll();
  if (pages.length === 0) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  const confirmed = await confirmDialog(
    "NPC Encounter Tracker — Initialize",
    `<p>This will process <strong>${pages.length}</strong> session log page(s) using AI to identify all NPCs the party has encountered.</p>
     <p style="color:#aaa;font-size:0.85em">Player characters listed in Settings → Player Character Names will be excluded.</p>`,
  );
  if (!confirmed) return;

  const playerNames = getPlayerNames();
  const prompt = buildExtractPrompt(playerNames);

  ui.notifications.info("LoreBridge NPC Encounters: Processing sessions…");

  const allNames = new Set<string>();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const names = await extractEncountersFromPage(page, prompt);
    for (const name of names) {
      if (!isGenericOrPlayer(name, playerNames)) allNames.add(name.trim());
    }
    if ((i + 1) % 5 === 0 || i === pages.length - 1) {
      ui.notifications.info(
        `LoreBridge NPC Encounters: processed ${i + 1} of ${pages.length} sessions…`,
      );
    }
  }

  const settings = getLoreBridgeSettings();
  const { added, alreadyKnown, journalsUpdated, journalsMissing } =
    await applyEncounters([...allNames], settings.lorefolderPath);

  const missingHtml =
    journalsMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${journalsMissing.slice(0, 20).map(escHtml).join(", ")}${journalsMissing.length > 20 ? ` + ${journalsMissing.length - 20} more` : ""}</p>`
      : "";

  showResultDialog(
    "NPC Encounters — Complete",
    `<p>✅ Added <strong>${added}</strong> new NPC(s) to encounter list.</p>
     <p>📋 Already tracked: <strong>${alreadyKnown}</strong></p>
     <p>🔑 Set Observer on <strong>${journalsUpdated}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

/** Current: process only the latest session log page. */
export async function updateNpcEncountersFromLatest(): Promise<void> {
  if (!game.user?.isGM) return;

  const page = sessionReadLatest();
  if (!page) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  const playerNames = getPlayerNames();
  const prompt = buildExtractPrompt(playerNames);

  ui.notifications.info(`LoreBridge NPC Encounters: Analyzing session ${page.sessionNumber}…`);

  const rawNames = await extractEncountersFromPage(page, prompt);
  const names = rawNames.filter((n) => !isGenericOrPlayer(n, playerNames));

  if (names.length === 0) {
    ui.notifications.info("LoreBridge NPC Encounters: No new NPCs detected in the latest session.");
    return;
  }

  // Show preview
  const confirmed = await confirmDialog(
    `NPC Encounters — Session ${page.sessionNumber}`,
    `<p>Detected <strong>${names.length}</strong> NPC(s) in session ${page.sessionNumber}:</p>
     <ul style="max-height:200px;overflow-y:auto;font-size:0.85em">${names.map((n) => `<li>${escHtml(n)}</li>`).join("")}</ul>
     <p style="color:#aaa;font-size:0.85em">Existing entries will be skipped. Observer will be set on new matches.</p>`,
  );
  if (!confirmed) return;

  const settings = getLoreBridgeSettings();
  const { added, alreadyKnown, journalsUpdated, journalsMissing } =
    await applyEncounters(names, settings.lorefolderPath);

  const missingHtml =
    journalsMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${journalsMissing.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "NPC Encounters — Complete",
    `<p>✅ Added <strong>${added}</strong> new NPC(s) from session ${page.sessionNumber}.</p>
     <p>📋 Already tracked: <strong>${alreadyKnown}</strong></p>
     <p>🔑 Set Observer on <strong>${journalsUpdated}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

/** Backup: commit encountered_npcs.json to GitHub. */
export async function backupNpcEncounters(): Promise<void> {
  if (!game.user?.isGM) return;
  try {
    ui.notifications.info("LoreBridge NPC Encounters: Backing up to GitHub…");
    const settings = getLoreBridgeSettings();
    const sessionNum = latestSessionNumber();
    await backupLoreFile(
      settings.lorefolderPath,
      FILENAME,
      `LoreBridge: Encountered NPCs backup — Session ${sessionNum}`,
    );
    ui.notifications.info("LoreBridge NPC Encounters: Backup complete.");
  } catch (err) {
    ui.notifications.error(
      `LoreBridge NPC Encounters backup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
