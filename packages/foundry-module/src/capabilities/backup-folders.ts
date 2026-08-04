/**
 * Shared folder-tree helpers used by all backup exporters.
 */

export type FoundryFolder = {
  id: string;
  name: string;
  type?: string;
  sort?: number;
  folder?: { id: string } | null;
  getFlag?(scope: string, key: string): unknown;
  setFlag?(scope: string, key: string, value: unknown): Promise<void>;
};

type FolderCollection = {
  contents?: unknown[];
  get?(id: string): unknown;
};

/**
 * Builds a Map<id, FoundryFolder> from three sources in order:
 *   1. game.folders.contents  (Foundry Collection array — most complete)
 *   2. document.folder refs   (immediate parents, always available)
 *   3. Ancestor lookups via game.folders.get(parentId) — climbs from leaf
 *      folders up to the root even when contents is sparse.
 */
export function buildFolderMap(
  documentFolders: Array<{ id: string; name?: string; folder?: { id: string } | null } | null | undefined>,
): Map<string, FoundryFolder> {
  const map = new Map<string, FoundryFolder>();
  const gFolders = (game as unknown as { folders?: FolderCollection }).folders;

  for (const raw of gFolders?.contents ?? []) {
    const f = raw as FoundryFolder;
    if (f?.id) map.set(f.id, f);
  }

  for (const sf of documentFolders) {
    if (sf?.id && !map.has(sf.id)) map.set(sf.id, sf as FoundryFolder);
  }

  if (gFolders?.get) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of Array.from(map.values())) {
        const parentId = f.folder?.id;
        if (parentId && !map.has(parentId)) {
          const parent = gFolders.get(parentId) as FoundryFolder | undefined;
          if (parent?.id) {
            map.set(parent.id, parent);
            changed = true;
          }
        }
      }
    }
  }

  return map;
}

/**
 * Returns the Set of folder IDs rooted at rootId (inclusive of all
 * descendants) using BFS over the id→folder map.
 */
export function collectSubtreeIds(
  rootId: string,
  folderById: Map<string, FoundryFolder>,
): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, f] of folderById) {
      if (!ids.has(id) && f.folder?.id && ids.has(f.folder.id)) {
        ids.add(id);
        changed = true;
      }
    }
  }
  return ids;
}

/**
 * Finds the root folder by name in the map, preferring a specific
 * document type but falling back to any type.
 */
export function findRootFolder(
  name: string,
  folderById: Map<string, FoundryFolder>,
  preferType?: string,
): FoundryFolder | undefined {
  const all = Array.from(folderById.values());
  return (
    (preferType ? all.find((f) => f.name === name && f.type === preferType) : undefined) ??
    all.find((f) => f.name === name)
  );
}
