/**
 * Campaign Codex Baseline — issue #TBD
 *
 * Exports a snapshot of all Campaign Codex journal names to GitHub and
 * pre-populates the tracker JSON files so session trackers can detect
 * changes without a full AI-driven Initialize pass.
 *
 * Pre-populate rules (only applied when the target file is empty):
 *   encountered_npcs.json  → string[] of NPC names (already-known NPCs)
 *   region_visits.json     → RegionVisitEntry[] with visited:false
 *   quest_status_summary.json → QuestStatusEntry[] with status:"available"
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import {
  getJournalsInFolder,
  readLoreJson,
  writeLoreJson,
  postBackend,
  confirmDialog,
  showResultDialog,
  escHtml,
  type JournalWithOps,
} from "./tracker-shared.js";
import type { RegionVisitEntry } from "./tracker-region-visits.js";
import type { QuestStatusEntry } from "./tracker-quest-status.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CCBaseline = {
  exportedAt: string;
  version: 1;
  npcs: string[];
  locations: string[];
  quests: string[];
  regions: string[];
};

const CC_FOLDERS = {
  npcs: "Campaign Codex - NPCs",
  locations: "Campaign Codex - Locations",
  quests: "Campaign Codex - Quests",
  regions: "Campaign Codex - Regions",
} as const;

const BASELINE_FILE = "cc_baseline.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function folderNames(folderName: string): string[] {
  return getJournalsInFolder(folderName)
    .map((j: JournalWithOps) => (j as unknown as { name: string }).name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}

// ---------------------------------------------------------------------------
// Core — no dialogs, callable from other features
// ---------------------------------------------------------------------------

export type BaselineExportResult = {
  baseline: CCBaseline;
  npcsPre: number;
  regionsPre: number;
  questsPre: number;
};

export async function exportBaselineCore(): Promise<BaselineExportResult> {
  requireFoundryGm("exportBaselineCore");
  const settings = getLoreBridgeSettings();
  const path = settings.lorefolderPath;

  const baseline: CCBaseline = {
    exportedAt: new Date().toISOString().slice(0, 10),
    version: 1,
    npcs: folderNames(CC_FOLDERS.npcs),
    locations: folderNames(CC_FOLDERS.locations),
    quests: folderNames(CC_FOLDERS.quests),
    regions: folderNames(CC_FOLDERS.regions),
  };

  await postBackend<unknown>("v1/backup/github/lore-files", {
    files: [
      {
        path: `campaign/${path}/${BASELINE_FILE}`,
        content: JSON.stringify(baseline, null, 2),
      },
    ],
    commitMessage: `LoreBridge: CC Baseline export — ${baseline.exportedAt}`,
  });

  // Pre-populate tracker JSONs only when they are empty
  let npcsPre = 0;
  let regionsPre = 0;
  let questsPre = 0;

  const existingNpcs = await readLoreJson<string[]>(path, "encountered_npcs.json");
  if (!existingNpcs || existingNpcs.length === 0) {
    await writeLoreJson(path, "encountered_npcs.json", baseline.npcs);
    npcsPre = baseline.npcs.length;
  }

  const existingRegions = await readLoreJson<RegionVisitEntry[]>(path, "region_visits.json");
  if (!existingRegions || existingRegions.length === 0) {
    const entries: RegionVisitEntry[] = baseline.regions.map((name) => ({
      name,
      visited: false,
      sessions: [],
      firstSeen: 0,
    }));
    await writeLoreJson(path, "region_visits.json", entries);
    regionsPre = entries.length;
  }

  const existingQuests = await readLoreJson<QuestStatusEntry[]>(path, "quest_status_summary.json");
  if (!existingQuests || existingQuests.length === 0) {
    const entries: QuestStatusEntry[] = baseline.quests.map((name) => ({
      name,
      status: "available" as const,
      session: 0,
      folder: "Available",
    }));
    await writeLoreJson(path, "quest_status_summary.json", entries);
    questsPre = entries.length;
  }

  return { baseline, npcsPre, regionsPre, questsPre };
}

// ---------------------------------------------------------------------------
// UI entry point
// ---------------------------------------------------------------------------

export async function runExportBaseline(): Promise<void> {
  if (!game.user?.isGM) return;

  const settings = getLoreBridgeSettings();
  const path = settings.lorefolderPath;

  const npcs = folderNames(CC_FOLDERS.npcs);
  const locs = folderNames(CC_FOLDERS.locations);
  const quests = folderNames(CC_FOLDERS.quests);
  const regions = folderNames(CC_FOLDERS.regions);

  const [existingNpcs, existingRegions, existingQuests] = await Promise.all([
    readLoreJson<string[]>(path, "encountered_npcs.json"),
    readLoreJson<unknown[]>(path, "region_visits.json"),
    readLoreJson<unknown[]>(path, "quest_status_summary.json"),
  ]);

  const emptyFiles: string[] = [];
  if (!existingNpcs || existingNpcs.length === 0) emptyFiles.push("NPCs");
  if (!existingRegions || existingRegions.length === 0) emptyFiles.push("Regions");
  if (!existingQuests || existingQuests.length === 0) emptyFiles.push("Quests");

  const row = (label: string, count: number) =>
    `<tr><td style="padding:3px 8px;font-weight:bold">${escHtml(label)}</td>
     <td style="padding:3px 8px">${count} journal(s)</td></tr>`;

  const preNote =
    emptyFiles.length > 0
      ? `<p style="color:#aaa;font-size:0.85em;margin-top:0.5rem">
           Will also pre-populate empty tracker files for: ${emptyFiles.join(", ")}.
           This lets session updates run without a full Initialize pass.
         </p>`
      : `<p style="color:#aaa;font-size:0.85em;margin-top:0.5rem">
           Existing tracker data will not be overwritten — only the baseline snapshot will be updated.
         </p>`;

  const confirmed = await confirmDialog(
    "Export Campaign Codex Baseline",
    `<p>Snapshot all Campaign Codex entries and commit to GitHub:</p>
     <table style="width:100%;border-collapse:collapse;font-size:0.9em;margin:0.5rem 0">
       ${row("NPCs", npcs.length)}
       ${row("Locations", locs.length)}
       ${row("Quests", quests.length)}
       ${row("Regions", regions.length)}
     </table>
     ${preNote}`,
  );
  if (!confirmed) return;

  ui.notifications.info("LoreBridge: Exporting CC baseline…");
  try {
    const { baseline, npcsPre, regionsPre, questsPre } = await exportBaselineCore();
    const prePopTotal = npcsPre + regionsPre + questsPre;
    const preHtml =
      prePopTotal > 0
        ? `<p style="font-size:0.85em;color:#aaa">Pre-populated: ${npcsPre} NPCs, ${regionsPre} regions, ${questsPre} quests.</p>`
        : "";
    showResultDialog(
      "CC Baseline Exported",
      `<p>✅ Committed: ${baseline.npcs.length} NPCs, ${baseline.locations.length} locations,
           ${baseline.quests.length} quests, ${baseline.regions.length} regions.</p>
       ${preHtml}`,
    );
  } catch (err) {
    ui.notifications.error(
      `LoreBridge baseline export failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
