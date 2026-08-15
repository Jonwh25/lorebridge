/**
 * GitHub Backup (All) — issue #278
 *
 * Commits all four LoreBridge JSON files and any CC macros to GitHub
 * in a single batch via the existing /v1/backup/github/lore-files endpoint.
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import {
  readLoreJson,
  postBackend,
  escHtml,
  latestSessionNumber,
  showResultDialog,
} from "./tracker-shared.js";

const JSON_FILES = [
  "npc_status.json",
  "encountered_npcs.json",
  "region_visits.json",
  "quest_status_summary.json",
] as const;

type MacroDoc = { name: string; command: string; type: string };

function normalizeMacroName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export type BackupAllResult = {
  filesCommitted: number;
  macrosExported: number;
  errors: string[];
};

/**
 * Core backup logic — callable directly by Post-Session Checklist.
 * Does not show dialogs.
 */
export async function backupAllCore(
  sessionNumber?: number,
  commitMessage?: string,
): Promise<BackupAllResult> {
  requireFoundryGm("backupAllCore");

  const settings = getLoreBridgeSettings();
  const sessionNum = sessionNumber ?? latestSessionNumber();
  const date = todayString();
  const message =
    commitMessage ??
    `LoreBridge: Full backup — Session ${sessionNum} (${date})`;

  const files: Array<{ path: string; content: string }> = [];
  const errors: string[] = [];

  for (const filename of JSON_FILES) {
    try {
      const data = await readLoreJson<unknown>(settings.lorefolderPath, filename);
      if (data !== null) {
        files.push({
          path: `campaign/${settings.lorefolderPath}/${filename}`,
          content: JSON.stringify(data, null, 2),
        });
      }
    } catch (err) {
      errors.push(
        `${filename}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  let macrosExported = 0;
  if (game.macros) {
    for (const macro of game.macros) {
      const m = macro as unknown as MacroDoc;
      if (m.name.startsWith("CC ") && m.type === "script") {
        const safeName = normalizeMacroName(m.name);
        if (safeName) {
          files.push({
            path: `campaign/macros/${safeName}.js`,
            content: m.command,
          });
          macrosExported++;
        }
      }
    }
  }

  if (files.length === 0) {
    throw new Error(
      "No files to back up. Run tracker Initialize steps first, or check GitHub settings.",
    );
  }

  await postBackend<unknown>("v1/backup/github/lore-files", {
    files,
    commitMessage: message,
  });

  return {
    filesCommitted: files.length - macrosExported,
    macrosExported,
    errors,
  };
}

/** UI entry point — shows result dialog after backup. */
export async function runBackupAll(): Promise<void> {
  if (!game.user?.isGM) return;
  try {
    ui.notifications.info("LoreBridge: Backing up to GitHub…");
    const result = await backupAllCore();
    const errorHtml =
      result.errors.length > 0
        ? `<p style="color:#c88;font-size:0.85em">Errors: ${result.errors.map(escHtml).join("; ")}</p>`
        : "";
    showResultDialog(
      "GitHub Backup Complete",
      `<p>✅ <strong>${result.filesCommitted}</strong> JSON file(s) committed.</p>
       <p>📜 <strong>${result.macrosExported}</strong> CC macro(s) exported.</p>
       ${errorHtml}`,
    );
  } catch (err) {
    ui.notifications.error(
      `LoreBridge backup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
