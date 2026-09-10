/**
 * Scene folder backup — serializes Foundry Scene documents from a named
 * folder into plain Markdown files.
 *
 * Asset binaries are NOT copied — only their paths are recorded in warnings.
 */

import type { BackupFileEntry } from "@lorebridge/shared/capabilities";
import { buildFolderMap, collectSubtreeIds, findRootFolder, type FoundryFolder } from "./backup-folders.js";

// ---------------------------------------------------------------------------
// Extended Foundry types
// ---------------------------------------------------------------------------

type SceneWithData = FoundryScene & {
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
 * Exports all Scene documents from the named folder (and all subfolders) to
 * plain Markdown files. Returns the list of files to commit and any warnings
 * (including inventoried asset paths that are NOT exported as binaries).
 */
export async function exportSceneFolder(
  folderName: string,
): Promise<{ files: BackupFileEntry[]; warnings: string[] }> {
  if (!game.scenes) {
    throw new Error("The Foundry scene collection is unavailable.");
  }

  const warnings: string[] = [];
  const files: BackupFileEntry[] = [];

  const allScenes = Array.from(game.scenes);

  type FolderLike = { id: string; name?: string; type?: string; sort?: number; folder?: { id: string } | null };
  const gFoldersCollection = (game as unknown as { folders?: { filter(fn: (f: FolderLike) => boolean): FolderLike[] } }).folders;
  const onlySceneFolders: FolderLike[] = gFoldersCollection?.filter(f => f.type === "Scene") ?? [];

  const folderById = new Map<string, FoundryFolder>();
  for (const f of onlySceneFolders) {
    folderById.set(f.id, f as FoundryFolder);
  }
  for (const scene of allScenes) {
    const sf = scene.folder as unknown as FoundryFolder | null;
    if (sf?.id && !folderById.has(sf.id)) folderById.set(sf.id, sf as FoundryFolder);
  }

  const rootFolder = findRootFolder(folderName, folderById, "Scene");

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Scenes. Check the folder name and try again.`,
    );
  }

  const targetFolderIds = collectSubtreeIds(rootFolder.id, folderById);

  const scenes = allScenes.filter(
    (s) => s.folder?.id && targetFolderIds.has(s.folder.id),
  );

  if (scenes.length === 0) {
    throw new Error(
      `No scenes found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

  for (const scene of scenes) {
    const rawSceneData = (scene as unknown as SceneWithData).toObject();
    const { background } = rawSceneData as { background?: Record<string, unknown> };
    const backgroundSrc = background?.src as string ?? "";
    if (backgroundSrc) {
      warnings.push(`Asset inventoried (not exported): ${backgroundSrc} (scene "${scene.name}")`);
    }

    files.push({
      path: `place/${slugify(scene.name)}.md`,
      content: `# ${scene.name}\n\n_Foundry scene backup._\n`,
    });
  }

  return { files, warnings };
}
