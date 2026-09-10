/**
 * Roll table folder backup — serializes Foundry RollTable documents from a
 * named folder (and all subfolders) into plain Markdown files.
 *
 * Asset binaries (result images) are NOT copied — only paths are recorded.
 */

import type { BackupFileEntry } from "@lorebridge/shared/capabilities";
import { buildFolderMap, collectSubtreeIds, findRootFolder, type FoundryFolder } from "./backup-folders.js";

// ---------------------------------------------------------------------------
// Extended Foundry types
// ---------------------------------------------------------------------------

type RollTableWithData = FoundryRollTable & {
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
 * Exports all RollTable documents from the named folder (and all subfolders)
 * to plain Markdown files.
 *
 * Called from the `/lb backup rolltables <folderName>` chat command.
 */
export async function exportRollTableFolder(
  folderName: string,
): Promise<{ files: BackupFileEntry[]; warnings: string[] }> {
  if (!game.tables) {
    throw new Error("The Foundry roll table collection is unavailable.");
  }

  const warnings: string[] = [];
  const files: BackupFileEntry[] = [];

  const allTables = Array.from(game.tables);
  const folderById = buildFolderMap(
    allTables.map((t) => t.folder as unknown as FoundryFolder | null),
  );

  const rootFolder = findRootFolder(folderName, folderById, "RollTable");

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Roll Tables. Check the folder name and try again.`,
    );
  }

  const targetFolderIds = collectSubtreeIds(rootFolder.id, folderById);

  const tables = allTables.filter(
    (t) => t.folder?.id && targetFolderIds.has(t.folder.id),
  );

  if (tables.length === 0) {
    throw new Error(
      `No roll tables found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

  for (const table of tables) {
    const rawData = (table as unknown as RollTableWithData).toObject();
    const results = (rawData.results as Array<Record<string, unknown>> | undefined) ?? [];
    for (const result of results) {
      const imgSrc = result.img as string | undefined;
      if (imgSrc && !imgSrc.startsWith("icons/")) {
        const label = String(result.description ?? "").slice(0, 40);
        warnings.push(
          `Asset inventoried (not exported): ${imgSrc} (roll table "${table.name}", result "${label}")`,
        );
      }
    }

    const formula = table.formula ?? "";
    files.push({
      path: `random-table/${slugify(table.name)}.md`,
      content: `# ${table.name}\n\nFormula: \`${formula}\`\n\n_Foundry roll table backup._\n`,
    });
  }

  return { files, warnings };
}
