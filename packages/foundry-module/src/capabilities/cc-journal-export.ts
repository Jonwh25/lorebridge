/**
 * CC Journal Export — issue #291
 *
 * Exports every journal inside each "Campaign Codex - *" folder to
 * GitHub under sources/campaign codex/<folder>/<journal>.md.
 */

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
// Helpers
// ---------------------------------------------------------------------------

const CC_FOLDER_PREFIX = "campaign codex - ";
const REPO_ROOT = "sources";
const EXPORT_BASE = "campaign codex";

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function journalToMarkdown(journal: FoundryJournal): string {
  const lines: string[] = [`# ${journal.name}`, ""];
  for (const page of journal.pages) {
    if (page.name) {
      lines.push(`## ${page.name}`, "");
    }
    const content = page.text?.content?.trim() ?? "";
    if (content) {
      lines.push(content, "");
    }
  }
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

// ---------------------------------------------------------------------------
// Core export logic
// ---------------------------------------------------------------------------

type ExportResult = {
  folders: { name: string; count: number }[];
  totalJournals: number;
  commitUrl: string;
};

export async function exportCCJournalsCore(): Promise<ExportResult> {
  const ccFolders = getCCFolders();
  if (ccFolders.length === 0) {
    throw new Error('No "Campaign Codex - *" folders found in your journal sidebar.');
  }

  const files: { path: string; content: string }[] = [];
  const folderCounts: { name: string; count: number }[] = [];

  for (const folder of ccFolders) {
    const journals = getJournalsInFolder(folder.id);
    let count = 0;
    for (const journal of journals) {
      const content = journalToMarkdown(journal);
      files.push({
        path: `${EXPORT_BASE}/${safeName(folder.name)}/${safeName(journal.name)}.md`,
        content,
      });
      count++;
    }
    if (count > 0) {
      folderCounts.push({ name: folder.name, count });
    }
  }

  if (files.length === 0) {
    throw new Error("All Campaign Codex folders are empty — nothing to export.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = await postBackend<{ commitUrl?: string }>("v1/backup/github/lore-files", {
    files,
    commitMessage: `LoreBridge: Campaign Codex export — ${today}`,
    repoRoot: REPO_ROOT,
  });

  return {
    folders: folderCounts,
    totalJournals: files.length,
    commitUrl: result.commitUrl ?? "",
  };
}

// ---------------------------------------------------------------------------
// UI entry point
// ---------------------------------------------------------------------------

export async function runExportCCJournals(): Promise<void> {
  requireFoundryGm("runExportCCJournals");

  ui.notifications.info("LoreBridge: Exporting Campaign Codex to GitHub…");
  try {
    const result = await exportCCJournalsCore();

    const rowsHtml = result.folders
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => `<tr><td>${escHtml(f.name)}</td><td style="text-align:center">${f.count}</td></tr>`)
      .join("");

    const linkHtml = result.commitUrl
      ? `<p style="margin-top:0.5rem"><a href="${escHtml(result.commitUrl)}" target="_blank" rel="noopener noreferrer">View commit on GitHub</a></p>`
      : "";

    showResultDialog(
      "Campaign Codex Export",
      `<p><strong>${result.totalJournals}</strong> journal${result.totalJournals !== 1 ? "s" : ""} exported to <code>sources/campaign codex/</code>.</p>
<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.9em">
  <thead><tr><th style="text-align:left;padding:2px 6px">Folder</th><th style="padding:2px 6px">Journals</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>${linkHtml}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ui.notifications.error(`LoreBridge CC Export: ${msg}`);
  }
}
