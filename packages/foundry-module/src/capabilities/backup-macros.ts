import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend } from "./tracker-shared.js";
import { BackupProgressDialog } from "../utils/backup-progress.js";

type MacroDoc = { name: string; command: string; type: string; scope?: string };

const CHUNK_SIZE = 25;

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function macroToMarkdown(macro: MacroDoc): string {
  const lines = [
    `# ${macro.name}`,
    "",
    `**Type:** ${macro.type}`,
    macro.scope ? `**Scope:** ${macro.scope}` : "",
    "",
    "```javascript",
    macro.command,
    "```",
  ].filter((l, i) => i !== 3 || l !== "");
  return lines.join("\n");
}

export async function runBackupMacros(): Promise<void> {
  requireFoundryGm("runBackupMacros");

  const settings = getLoreBridgeSettings();
  const basePath = settings.backupPathMacros;

  const macros = Array.from(game.macros as Iterable<MacroDoc>);
  if (macros.length === 0) {
    ui.notifications.warn("LoreBridge: No macros found to back up.");
    return;
  }

  const files = macros
    .filter((m) => m.name && m.command)
    .map((m) => ({
      path: `${basePath}/${safeName(m.name)}.md`,
      content: macroToMarkdown(m),
    }));

  if (files.length === 0) {
    ui.notifications.warn("LoreBridge: No non-empty macros to back up.");
    return;
  }

  const chunks = chunkArray(files, CHUNK_SIZE);
  const progress = new BackupProgressDialog(`Backing up ${files.length} macro(s) to GitHub…`, files.length);
  await progress.render(true);

  try {
    let done = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      await postBackend<unknown>("v1/backup/github/lore-files", {
        files: chunk,
        commitMessage: `LoreBridge: Backup macros${partLabel}`,
        repoRoot: "",
      });
      done += chunk.length;
      progress.setProgress(done);
    }
    await progress.close();
    ui.notifications.info(`LoreBridge: ✅ Backed up ${files.length} macro(s).`);
  } catch (err) {
    await progress.close();
    ui.notifications.error(`LoreBridge macro backup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
