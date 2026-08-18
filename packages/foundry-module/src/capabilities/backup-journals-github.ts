/**
 * Simple Markdown journal backup to GitHub (#307).
 * Distinct from backup-journals.ts (Raven's Eye fidelity backup).
 * Exports journals not in "Campaign Codex - *" folders and not the
 * Session Logs journal to the configured backupPathJournals path.
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend } from "./tracker-shared.js";
import { plainText } from "../utils/html.js";
import { BackupProgressDialog } from "../utils/backup-progress.js";
import { promptFolderSelection } from "../utils/backup-folder-picker.js";

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
  const folderName = (j.folder?.name ?? "").toLowerCase();
  return folderName.startsWith(CC_FOLDER_PREFIX);
}

function journalToFiles(
  journal: FoundryJournal,
  basePath: string,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const journalDir = `${basePath}/${safeName(journal.name)}`;
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

  const folderMap = new Map<string | null, string>();
  for (const j of journals) {
    const id = j.folder?.id ?? null;
    if (!folderMap.has(id)) folderMap.set(id, j.folder?.name ?? "(No Folder)");
  }
  const folders = Array.from(folderMap.entries())
    .sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""))
    .map(([id, name]) => ({ id, name }));

  const selected = await promptFolderSelection("Backup Journals — Select Folders", folders);
  if (selected === null) return;

  const selectedSet = new Set(selected);
  const filtered = journals.filter((j) => selectedSet.has(j.folder?.id ?? null));
  if (filtered.length === 0) {
    ui.notifications.warn("LoreBridge: No journals in the selected folders.");
    return;
  }

  const allFiles = filtered.flatMap((j) => journalToFiles(j, basePath));
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
