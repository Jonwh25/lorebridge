/**
 * CC Journal Export — issue #291
 *
 * Exports every journal inside each "Campaign Codex - *" folder tree, plus
 * each page of the Session Logs journal, to GitHub under
 * sources/campaign codex/<folder>/<subfolders>/<name>.md.
 *
 * Subfolder structure is preserved (e.g. Quests/Available/, Quests/Completed/).
 * Files are committed in chunks of CHUNK_SIZE so rate limits and proxy
 * timeouts are never hit even for large folders like NPCs (100+) or
 * Session Logs (60+).
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend, escHtml, showResultDialog } from "./tracker-shared.js";
import { buildFolderMap, collectSubtreeIds, type FoundryFolder } from "./backup-folders.js";

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
  folder?: { id: string } | null;
  pages: Iterable<FoundryPage>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CC_FOLDER_PREFIX = "campaign codex - ";
const REPO_ROOT = "sources";
const EXPORT_BASE = "campaign codex";
const CHUNK_SIZE = 25; // files per commit — keeps each request under ~10 s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
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

function getCCRootFolders(folderById: Map<string, FoundryFolder>): FoundryFolder[] {
  return Array.from(folderById.values()).filter(
    (f) =>
      typeof f.name === "string" &&
      f.name.toLowerCase().startsWith(CC_FOLDER_PREFIX) &&
      f.type === "JournalEntry",
  );
}

function relativePathSegments(
  folderId: string,
  rootFolderId: string,
  folderById: Map<string, FoundryFolder>,
): string[] {
  const segments: string[] = [];
  let current: string | undefined = folderId;
  while (current && current !== rootFolderId) {
    const f = folderById.get(current);
    if (!f) break;
    segments.unshift(safeName(f.name));
    current = f.folder?.id;
  }
  return segments;
}

function journalsInSubtree(
  rootFolder: FoundryFolder,
  folderById: Map<string, FoundryFolder>,
): Array<{ path: string; content: string }> {
  const subtreeIds = collectSubtreeIds(rootFolder.id, folderById);
  const files: Array<{ path: string; content: string }> = [];

  for (const j of game.journal as Iterable<FoundryJournal>) {
    const folderId = j.folder?.id;
    if (!folderId || !subtreeIds.has(folderId)) continue;

    const subSegments = relativePathSegments(folderId, rootFolder.id, folderById);
    const filePath = [
      EXPORT_BASE,
      safeName(rootFolder.name),
      ...subSegments,
      `${safeName(j.name)}.md`,
    ].join("/");

    files.push({ path: filePath, content: journalToMarkdown(j) });
  }

  return files;
}

async function commitChunk(
  files: { path: string; content: string }[],
  message: string,
): Promise<string> {
  const result = await postBackend<{ commitUrl?: string }>("v1/backup/github/lore-files", {
    files,
    commitMessage: message,
    repoRoot: REPO_ROOT,
  });
  return result.commitUrl ?? "";
}

// ---------------------------------------------------------------------------
// UI entry point
// ---------------------------------------------------------------------------

export async function runExportCCJournals(): Promise<void> {
  requireFoundryGm("runExportCCJournals");

  const folderById = buildFolderMap([]);
  const ccRootFolders = getCCRootFolders(folderById);

  const sessionFolderName = getLoreBridgeSettings().sessionLogFolder || "Session Logs";
  let sessionPages: { path: string; content: string }[] = [];
  for (const j of game.journal as Iterable<FoundryJournal>) {
    if ((j.name ?? "").trim().toLowerCase() !== sessionFolderName.trim().toLowerCase()) continue;
    for (const page of j.pages) {
      if (!page.name) continue;
      sessionPages.push({
        path: `${EXPORT_BASE}/${safeName(sessionFolderName)}/${safeName(page.name)}.md`,
        content: pageToMarkdown(page),
      });
    }
    break;
  }

  // Pre-gather and chunk so the total step count is accurate up front.
  type WorkItem = { label: string; commitLabel: string; files: { path: string; content: string }[] };
  const work: WorkItem[] = [];

  for (const folder of ccRootFolders) {
    const files = journalsInSubtree(folder, folderById);
    if (files.length === 0) continue;
    const chunks = chunkArray(files, CHUNK_SIZE);
    chunks.forEach((chunk, i) => {
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      work.push({
        label: `${folder.name}${partLabel}`,
        commitLabel: `Export ${folder.name}${partLabel}`,
        files: chunk,
      });
    });
  }

  if (sessionPages.length > 0) {
    const chunks = chunkArray(sessionPages, CHUNK_SIZE);
    chunks.forEach((chunk, i) => {
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      work.push({
        label: `${sessionFolderName}${partLabel}`,
        commitLabel: `Export ${sessionFolderName}${partLabel}`,
        files: chunk,
      });
    });
  }

  if (work.length === 0) {
    ui.notifications.warn("LoreBridge CC Export: Nothing to export.");
    return;
  }

  let totalFiles = 0;
  let lastCommitUrl = "";

  // Track per-folder totals for the result dialog.
  const folderTotals = new Map<string, number>();

  try {
    for (let i = 0; i < work.length; i++) {
      const item = work[i]!;
      ui.notifications.info(`LoreBridge CC Export: ${item.label} (${i + 1}/${work.length})…`);
      lastCommitUrl = await commitChunk(item.files, item.commitLabel);
      totalFiles += item.files.length;

      // Attribute files back to their CC root folder name for the summary.
      for (const f of item.files) {
        const seg = f.path.split("/")[1] ?? item.label;
        folderTotals.set(seg, (folderTotals.get(seg) ?? 0) + 1);
      }
    }

    const rowsHtml = Array.from(folderTotals.entries())
      .map(([name, count]) => `<tr><td>${escHtml(name)}</td><td style="text-align:center">${count}</td></tr>`)
      .join("");

    const linkHtml = lastCommitUrl
      ? `<p style="margin-top:0.5rem"><a href="${escHtml(lastCommitUrl)}" target="_blank" rel="noopener noreferrer">View last commit on GitHub</a></p>`
      : "";

    showResultDialog(
      "Campaign Codex Export",
      `<p><strong>${totalFiles}</strong> file${totalFiles !== 1 ? "s" : ""} exported to <code>sources/campaign codex/</code>.</p>
<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.9em">
  <thead><tr><th style="text-align:left;padding:2px 6px">Folder</th><th style="padding:2px 6px">Files</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>${linkHtml}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ui.notifications.error(`LoreBridge CC Export: ${msg}`);
  }
}
