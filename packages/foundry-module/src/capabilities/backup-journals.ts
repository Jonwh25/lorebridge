/**
 * Journal folder backup — serializes Foundry JournalEntry documents from a
 * named folder (and all subfolders) into plain Markdown files (text pages,
 * human-readable).
 */

import type { BackupFileEntry } from "@lorebridge/shared/capabilities";
import { buildFolderMap, collectSubtreeIds, findRootFolder } from "./backup-folders.js";
import { plainText } from "../utils/html.js";

// ---------------------------------------------------------------------------
// Extended Foundry types
// ---------------------------------------------------------------------------

type JournalWithFlags = FoundryJournalEntry & {
  folder?: { id: string; name: string } | null;
  toObject(): Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "unnamed";
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Exports all JournalEntry documents from the named folder (and all
 * subfolders) to plain Markdown files (text pages only).
 *
 * Called from the `/lb backup journals <folderName>` chat command.
 */
export async function exportJournalFolder(
  folderName: string,
): Promise<{ files: BackupFileEntry[]; warnings: string[] }> {
  if (!game.journal) {
    throw new Error("The Foundry journal collection is unavailable.");
  }

  const warnings: string[] = [];
  const files: BackupFileEntry[] = [];

  // Build folder map and find root.
  const allJournals = Array.from(game.journal);
  const folderById = buildFolderMap(
    allJournals.map((j) => (j as unknown as JournalWithFlags).folder ?? null),
  );
  const rootFolder = findRootFolder(folderName, folderById, "JournalEntry");

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Journal Entries. Check the folder name and try again.`,
    );
  }

  const targetFolderIds = collectSubtreeIds(rootFolder.id, folderById);

  const journals = allJournals.filter((j) => {
    const folder = (j as unknown as JournalWithFlags).folder;
    return folder?.id && targetFolderIds.has(folder.id);
  });

  if (journals.length === 0) {
    throw new Error(
      `No journal entries found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

  // Serialize each journal entry to plain Markdown.
  const usedSlugs = new Map<string, number>();
  for (const journal of journals) {
    const pages = Array.from(journal.pages);
    const textContent: string[] = [];

    for (const page of pages.sort((a, b) => a.sort - b.sort)) {
      if (page.type !== "text") {
        const imgSrc = (page as unknown as { src?: string }).src;
        if (imgSrc) {
          warnings.push(`Asset inventoried (not exported): ${imgSrc} (journal "${journal.name}", page "${page.name}")`);
        }
        continue;
      }
      const html = page.text?.content ?? "";
      const text = plainText(html).trim();
      if (page.name) {
        textContent.push(`## ${page.name}\n\n${text}`);
      } else {
        textContent.push(text);
      }
    }

    if (textContent.length === 0) {
      warnings.push(`Journal "${journal.name}" has no text pages — skipped.`);
      continue;
    }

    const baseSlug = slugify(journal.name);
    const count = usedSlugs.get(baseSlug) ?? 0;
    usedSlugs.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;

    const body = textContent.join("\n\n");
    files.push({ path: `entry/${slug}.md`, content: `# ${journal.name}\n\n${body}\n` });
  }

  return { files, warnings };
}
