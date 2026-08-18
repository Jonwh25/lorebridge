/**
 * Simple Markdown journal backup to GitHub (#307).
 * Distinct from backup-journals.ts (Raven's Eye fidelity backup).
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend } from "./tracker-shared.js";
import { plainText } from "../utils/html.js";
import { BackupProgressDialog } from "../utils/backup-progress.js";
import { promptFolderSelection } from "../utils/backup-folder-picker.js";
import { buildFolderMap, buildPickerFolders, expandFolderIds, folderPath } from "../utils/folder-tree.js";

type FoundryPage = {
  name: string;
  text?: { content?: string };
};

type FoundryJournal = {
  name: string;
  folder?: { id: string; name: string } | null;
  pages: Iterable<FoundryPage>;
};

const CC_FOLDER_PREFIX = "campaign codex - ";
const CHUNK_SIZE = 25;

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function isCcJournal(j: FoundryJournal): boolean {
  return (j.folder?.name ?? "").toLowerCase().startsWith(CC_FOLDER_PREFIX);
}

function journalToFiles(
  journal: FoundryJournal,
  basePath: string,
  fp: string,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const safePath = fp ? fp.split("/").map(safeName).join("/") : "";
  const journalDir = safePath
    ? `${basePath}/${safePath}/${safeName(journal.name)}`
    : `${basePath}/${safeName(journal.name)}`;
  for (const page of journal.pages) {
    if (!page.name) continue;
    const content = plainText(page.text?.content ?? "").trim();
    const md = [`# ${journal.name}`, `## ${page.name}`, "", content].join("\n");
    files.push({ path: `${journalDir}/${safeName(page.name)}.md`, content: md });
  }
  return files;
}

export async function runBackupJournals(): Promise<void> {
  requireFoundryGm("runBackupJournals");

  const settings = getLoreBridgeSettings();
  const basePath = settings.backupPathJournals;
  const sessionFolderName = settings.sessionLogFolder || "Session Logs";

  const journals = Array.from(game.journal as Iterable<FoundryJournal>).filter(
    (j) =>
      !isCcJournal(j) &&
      j.name.trim().toLowerCase() !== sessionFolderName.trim().toLowerCase(),
  );

  if (journals.length === 0) {
    ui.notifications.warn("LoreBridge: No non-CC journals found to back up.");
    return;
  }

  const folderMap = buildFolderMap("JournalEntry");

  const directFolderIds = new Set<string | null>(journals.map((j) => j.folder?.id ?? null));
  const pickerFolders = buildPickerFolders(directFolderIds, folderMap);

  const selected = await promptFolderSelection("Backup Journals — Select Folders", pickerFolders);
  if (selected === null) return;

  const expandedIds = expandFolderIds(selected, folderMap);
  const filtered = journals.filter((j) => expandedIds.has(j.folder?.id ?? null));
  if (filtered.length === 0) {
    ui.notifications.warn("LoreBridge: No journals in the selected folders.");
    return;
  }

  const allFiles = filtered.flatMap((j) =>
    journalToFiles(j, basePath, folderPath(j.folder?.id ?? null, folderMap)),
  );
  if (allFiles.length === 0) {
    ui.notifications.warn("LoreBridge: Selected journals have no pages to export.");
    return;
  }

  const chunks = chunkArray(allFiles, CHUNK_SIZE);
  const progress = new BackupProgressDialog(`Backing up ${allFiles.length} journal page(s) to GitHub…`, allFiles.length);
  await progress.render(true);

  try {
    let done = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      await postBackend<unknown>("v1/backup/github/lore-files", {
        files: chunk,
        commitMessage: `LoreBridge: Backup journals${partLabel}`,
        repoRoot: "",
      });
      done += chunk.length;
      progress.setProgress(done);
    }
    await progress.close();
    ui.notifications.info(`LoreBridge: ✅ Backed up ${allFiles.length} journal page(s) from ${filtered.length} journal(s).`);
  } catch (err) {
    await progress.close();
    ui.notifications.error(`LoreBridge journal backup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
