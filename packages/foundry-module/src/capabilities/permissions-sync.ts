/**
 * Player Permissions Sync — issue #274
 *
 * Reads the three LoreBridge tracker JSON files and sets Observer
 * (ownership.default = 2) on matching Campaign Codex journals in one pass.
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import {
  readLoreJson,
  getJournalsInFolder,
  findMatchingJournal,
  confirmDialog,
  showResultDialog,
  escHtml,
  type JournalWithOps,
} from "./tracker-shared.js";

const OBSERVER = 2;

type NamedEntry = { name: string };
type QuestEntry = { name: string; status: string };

async function setObserver(journal: JournalWithOps): Promise<void> {
  await journal.update({ ownership: { default: OBSERVER } });
}

type CategoryResult = { category: string; applied: number; missing: string[] };

async function syncCategory(
  names: string[],
  folderName: string,
  label: string,
): Promise<CategoryResult> {
  const journals = getJournalsInFolder(folderName);
  let applied = 0;
  const missing: string[] = [];
  for (const name of names) {
    const journal = findMatchingJournal(name, journals);
    if (journal) {
      await setObserver(journal);
      applied++;
    } else {
      missing.push(name);
    }
  }
  return { category: label, applied, missing };
}

export type PermissionsSyncResult = {
  npc: CategoryResult;
  region: CategoryResult;
  quest: CategoryResult;
};

/**
 * Core sync logic — can be called directly by the Post-Session Checklist
 * without showing dialogs.
 */
export async function syncPermissionsCore(): Promise<PermissionsSyncResult> {
  requireFoundryGm("syncPermissionsCore");
  const settings = getLoreBridgeSettings();
  const path = settings.lorefolderPath;

  const [npcs, regions, quests] = await Promise.all([
    readLoreJson<NamedEntry[]>(path, "encountered_npcs.json"),
    readLoreJson<NamedEntry[]>(path, "region_visits.json"),
    readLoreJson<QuestEntry[]>(path, "quest_status_summary.json"),
  ]);

  const npcNames = (npcs ?? []).map((e) => e.name);
  const regionNames = (regions ?? []).map((e) => e.name);
  const questNames = (quests ?? [])
    .filter((e) => e.status !== "available")
    .map((e) => e.name);

  const [npc, region, quest] = await Promise.all([
    syncCategory(npcNames, "Campaign Codex - NPCs", "NPCs"),
    syncCategory(regionNames, "Campaign Codex - Regions", "Regions"),
    syncCategory(questNames, "Campaign Codex - Quests", "Quests"),
  ]);

  return { npc, region, quest };
}

/** UI entry point — shows confirmation and result dialogs. */
export async function syncPermissions(): Promise<void> {
  if (!game.user?.isGM) return;

  const settings = getLoreBridgeSettings();
  const path = settings.lorefolderPath;

  const [npcs, regions, quests] = await Promise.all([
    readLoreJson<NamedEntry[]>(path, "encountered_npcs.json"),
    readLoreJson<NamedEntry[]>(path, "region_visits.json"),
    readLoreJson<QuestEntry[]>(path, "quest_status_summary.json"),
  ]);

  const npcNames = (npcs ?? []).map((e) => e.name);
  const regionNames = (regions ?? []).map((e) => e.name);
  const questNames = (quests ?? [])
    .filter((e) => e.status !== "available")
    .map((e) => e.name);

  const total = npcNames.length + regionNames.length + questNames.length;
  if (total === 0) {
    ui.notifications.warn(
      "LoreBridge: No tracker data found. Run Initialize on each tracker first.",
    );
    return;
  }

  const row = (label: string, count: number, note?: string) =>
    `<tr>
       <td style="padding:3px 8px;font-weight:bold">${escHtml(label)}</td>
       <td style="padding:3px 8px">${count} journal(s)</td>
       <td style="padding:3px 8px;color:#aaa;font-size:0.8em">${note ? escHtml(note) : ""}</td>
     </tr>`;

  const confirmed = await confirmDialog(
    "Sync Permissions",
    `<p>Set Observer on matching Campaign Codex journals:</p>
     <table style="width:100%;border-collapse:collapse;font-size:0.9em;margin:0.5rem 0">
       ${row("NPCs", npcNames.length)}
       ${row("Regions", regionNames.length)}
       ${row("Quests", questNames.length, "available quests excluded")}
     </table>
     <p style="color:#aaa;font-size:0.85em">Permissions are never reverted once set.</p>`,
  );
  if (!confirmed) return;

  ui.notifications.info("LoreBridge: Syncing permissions…");

  const result = await syncPermissionsCore();
  const { npc, region, quest } = result;

  const missingHtml = (r: CategoryResult) =>
    r.missing.length > 0
      ? `<p style="color:#c88;font-size:0.8em">No match found: ${r.missing.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "Permissions Synced",
    `<p>✅ NPCs: <strong>${npc.applied}</strong> updated${npc.missing.length > 0 ? `, ${npc.missing.length} not found` : ""}.</p>
     ${missingHtml(npc)}
     <p>✅ Regions: <strong>${region.applied}</strong> updated${region.missing.length > 0 ? `, ${region.missing.length} not found` : ""}.</p>
     ${missingHtml(region)}
     <p>✅ Quests: <strong>${quest.applied}</strong> updated${quest.missing.length > 0 ? `, ${quest.missing.length} not found` : ""}.</p>
     ${missingHtml(quest)}`,
  );
}
