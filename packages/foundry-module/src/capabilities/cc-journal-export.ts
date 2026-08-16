/**
 * CC Journal Export — issue #291
 *
 * Exports every journal inside each "Campaign Codex - *" folder, plus each
 * page of the Session Logs journal, to GitHub under
 * sources/campaign codex/<folder>/<name>.md.
 *
 * Each folder is committed separately so the UI can show per-folder progress.
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend, escHtml, showResultDialog } from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FoundryPage = {
  name: string;
  text?: { content?: string; format?: number };
  type?: string;
};

type FoundryJournal = {
  id: string;
  name: string;
  folder?: { id: string; name?: string } | null;
  pages: Iterable<FoundryPage>;
};

type FoundryFolderEntry = {
  id: string;
  name: string;
  type?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CC_FOLDER_PREFIX = "campaign codex - ";
const REPO_ROOT = "sources";
const EXPORT_BASE = "campaign codex";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function journalToMarkdown(journal: FoundryJournal): string {
  const lines: string[] = [`# ${journal.name}`, ""];
  for (const page of journal.pages) {
    if (page.name) lines.push(`## ${page.name}`, "");
    const content = page.text?.content?.trim() ?? "";
    if (content) lines.push(content, "");
  }
  return lines.join("\n");
}

function pageToMarkdown(page: FoundryPage): string {
  const lines: string[] = [`# ${page.name}`, ""];
  const content = page.text?.content?.trim() ?? "";
  if (content) lines.push(content, "");
  return lines.join("\n");
}

function getCCFolders(): FoundryFolderEntry[] {
  const folders = (game as unknown as { folders?: { contents?: unknown[] } }).folders;
  return (folders?.contents ?? []).filter((f): f is FoundryFolderEntry => {
    const entry = f as FoundryFolderEntry;
    return (
      !!entry?.id &&
      typeof entry.name === "string" &&
      entry.name.toLowerCase().startsWith(CC_FOLDER_PREFIX) &&
      entry.type === "JournalEntry"
    );
  });
}

function getJournalsInFolder(folderId: string): FoundryJournal[] {
  const results: FoundryJournal[] = [];
  for (const j of game.journal as Iterable<FoundryJournal>) {
    if (j.folder?.id === folderId) results.push(j);
  }
  return results;
}

function getJournalByName(name: string): FoundryJournal | undefined {
  const lower = name.trim().toLowerCase();
  for (const j of game.journal as Iterable<FoundryJournal>) {
    if ((j.name ?? "").trim().toLowerCase() === lower) return j;
  }
  return undefined;
}

async function commitFolder(
  files: { path: string; content: string }[],
  folderName: string,
): Promise<string> {
  const result = await postBackend<{ commitUrl?: string }>("v1/backup/github/lore-files", {
    files,
    commitMessage: `LoreBridge: Export ${folderName}`,
    repoRoot: REPO_ROOT,
  });
  return result.commitUrl ?? "";
}

// ---------------------------------------------------------------------------
// UI entry point
// ---------------------------------------------------------------------------

export async function runExportCCJournals(): Promise<void> {
  requireFoundryGm("runExportCCJournals");

  const ccFolders = getCCFolders();
  const sessionFolderName = getLoreBridgeSettings().sessionLogFolder || "Session Logs";
  const sessionJournal = getJournalByName(sessionFolderName);

  // Pre-calculate total steps so the counter is accurate from the start.
  const activeCCFolders = ccFolders.filter((f) => getJournalsInFolder(f.id).length > 0);
  const hasSessionLogs = !!sessionJournal && Array.from(sessionJournal.pages).some((p) => p.name);
  const totalSteps = activeCCFolders.length + (hasSessionLogs ? 1 : 0);

  if (totalSteps === 0) {
    ui.notifications.warn("LoreBridge CC Export: Nothing to export — no Campaign Codex journals or session log pages found.");
    return;
  }

  let step = 0;
  let totalFiles = 0;
  const folderCounts: { name: string; count: number }[] = [];
  let lastCommitUrl = "";

  try {
    // --- Campaign Codex folders ---
    for (const folder of activeCCFolders) {
      const journals = getJournalsInFolder(folder.id);
      step++;
      ui.notifications.info(`LoreBridge CC Export: ${folder.name} (${step}/${totalSteps})…`);

      const files = journals.map((j) => ({
        path: `${EXPORT_BASE}/${safeName(folder.name)}/${safeName(j.name)}.md`,
        content: journalToMarkdown(j),
      }));

      lastCommitUrl = await commitFolder(files, folder.name);
      folderCounts.push({ name: folder.name, count: journals.length });
      totalFiles += journals.length;
    }

    // --- Session Logs (one file per page) ---
    if (hasSessionLogs && sessionJournal) {
      const pages: { path: string; content: string }[] = [];
      for (const page of sessionJournal.pages) {
        if (!page.name) continue;
        pages.push({
          path: `${EXPORT_BASE}/${safeName(sessionFolderName)}/${safeName(page.name)}.md`,
          content: pageToMarkdown(page),
        });
      }

      if (pages.length > 0) {
        step++;
        ui.notifications.info(`LoreBridge CC Export: Session Logs (${step}/${totalSteps})…`);

        lastCommitUrl = await commitFolder(pages, sessionFolderName);
        folderCounts.push({ name: sessionFolderName, count: pages.length });
        totalFiles += pages.length;
      }
    }

    // --- Result dialog ---
    const rowsHtml = folderCounts
      .map((f) => `<tr><td>${escHtml(f.name)}</td><td style="text-align:center">${f.count}</td></tr>`)
      .join("");

    const linkHtml = lastCommitUrl
      ? `<p style="margin-top:0.5rem"><a href="${escHtml(lastCommitUrl)}" target="_blank" rel="noopener noreferrer">View last commit on GitHub</a></p>`
      : "";

    showResultDialog(
      "Campaign Codex Export",
      `<p><strong>${totalFiles}</strong> file${totalFiles !== 1 ? "s" : ""} exported to <code>sources/campaign codex/</code>.</p>
<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.9em">
  <thead><tr><th style="text-align:left;padding:2px 6px">Folder / Journal</th><th style="padding:2px 6px">Files</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>${linkHtml}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ui.notifications.error(`LoreBridge CC Export: ${msg}`);
  }
}
