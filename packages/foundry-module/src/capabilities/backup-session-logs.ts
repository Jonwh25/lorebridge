import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend } from "./tracker-shared.js";
import { htmlToMarkdown } from "../utils/html.js";
import { BackupProgressDialog } from "../utils/backup-progress.js";

type FoundryPage = {
  name: string;
  text?: { content?: string };
};

type FoundryJournal = {
  name: string;
  pages: Iterable<FoundryPage>;
};

const CHUNK_SIZE = 25;

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function pageToMarkdown(page: FoundryPage): string {
  const lines: string[] = [`# ${page.name}`, ""];
  const content = htmlToMarkdown(page.text?.content ?? "").trim();
  if (content) lines.push(content, "");
  return lines.join("\n");
}

export async function runBackupSessionLogs(): Promise<void> {
  requireFoundryGm("runBackupSessionLogs");

  const settings = getLoreBridgeSettings();
  const basePath = settings.backupPathSessionLogs;
  const folderName = settings.sessionLogFolder || "Session Logs";

  const journal = Array.from(game.journal as Iterable<FoundryJournal>).find(
    (j) => j.name.trim().toLowerCase() === folderName.trim().toLowerCase(),
  );

  if (!journal) {
    ui.notifications.warn(`LoreBridge: Session log journal "${folderName}" not found.`);
    return;
  }

  const pages = Array.from(journal.pages).filter((p) => p.name);
  if (pages.length === 0) {
    ui.notifications.warn("LoreBridge: No session log pages found to back up.");
    return;
  }

  const files = pages.map((p) => ({
    path: `${basePath}/${safeName(p.name)}.md`,
    content: pageToMarkdown(p),
  }));

  const chunks = chunkArray(files, CHUNK_SIZE);
  const progress = new BackupProgressDialog(`Backing up ${files.length} session log(s) to GitHub…`, files.length);
  await progress.render(true);

  try {
    let done = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      await postBackend<unknown>("v1/backup/github/lore-files", {
        files: chunk,
        commitMessage: `LoreBridge: Backup session logs${partLabel}`,
        repoRoot: "",
      });
      done += chunk.length;
      progress.setProgress(done);
    }
    await progress.close();
    ui.notifications.info(`LoreBridge: ✅ Backed up ${files.length} session log page(s).`);
  } catch (err) {
    await progress.close();
    ui.notifications.error(`LoreBridge session log backup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
