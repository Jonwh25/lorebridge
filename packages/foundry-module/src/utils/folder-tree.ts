/**
 * Utilities for building and traversing Foundry folder hierarchies.
 * Used by backup capabilities to support recursive folder selection.
 */

type FoundryFolderRaw = {
  id: string;
  name: string;
  type: string;
  folder?: { id: string } | null;
};

export type FolderInfo = { id: string; name: string; parentId: string | null };

export function buildFolderMap(foundryType: string): Map<string, FolderInfo> {
  const map = new Map<string, FolderInfo>();
  for (const f of Array.from(game.folders as Iterable<FoundryFolderRaw>)) {
    if (f.type === foundryType) {
      map.set(f.id, { id: f.id, name: f.name, parentId: f.folder?.id ?? null });
    }
  }
  return map;
}

/** Expand selected folder IDs to include all descendant folders. */
export function expandFolderIds(
  selectedIds: Array<string | null>,
  folderMap: Map<string, FolderInfo>,
): Set<string | null> {
  const childrenMap = new Map<string, string[]>();
  for (const info of folderMap.values()) {
    if (info.parentId !== null) {
      if (!childrenMap.has(info.parentId)) childrenMap.set(info.parentId, []);
      childrenMap.get(info.parentId)!.push(info.id);
    }
  }
  const result = new Set<string | null>(selectedIds);
  const queue = selectedIds.filter((id): id is string => id !== null);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const childId of childrenMap.get(id) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}

/** Build the full slash-separated folder path for a given folder ID. */
export function folderPath(folderId: string | null, folderMap: Map<string, FolderInfo>): string {
  const parts: string[] = [];
  let current = folderId;
  while (current !== null) {
    const info = folderMap.get(current);
    if (!info) break;
    parts.unshift(info.name);
    current = info.parentId;
  }
  return parts.join("/");
}

/**
 * Build a hierarchically ordered list of folders to show in the picker.
 * Includes ancestor folders (so the user can select a parent to get all children).
 * Items without a folder are represented as { id: null, name: "(No Folder)", depth: 0 }.
 */
export function buildPickerFolders(
  directFolderIds: Set<string | null>,
  folderMap: Map<string, FolderInfo>,
): Array<{ id: string | null; name: string; depth: number }> {
  const allRelevantIds = new Set<string>();
  for (const id of directFolderIds) {
    if (id === null) continue;
    let current: string | null = id;
    while (current !== null) {
      allRelevantIds.add(current);
      current = folderMap.get(current)?.parentId ?? null;
    }
  }

  const childrenMap = new Map<string, string[]>();
  for (const id of allRelevantIds) {
    const parentId = folderMap.get(id)?.parentId ?? null;
    if (parentId !== null && allRelevantIds.has(parentId)) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(id);
    }
  }

  const rootIds = Array.from(allRelevantIds)
    .filter((id) => {
      const parentId = folderMap.get(id)?.parentId ?? null;
      return parentId === null || !allRelevantIds.has(parentId);
    })
    .sort((a, b) => (folderMap.get(a)?.name ?? "").localeCompare(folderMap.get(b)?.name ?? ""));

  const result: Array<{ id: string | null; name: string; depth: number }> = [];

  if (directFolderIds.has(null)) {
    result.push({ id: null, name: "(No Folder)", depth: 0 });
  }

  function dfs(id: string, depth: number): void {
    const info = folderMap.get(id);
    if (!info) return;
    result.push({ id, name: info.name, depth });
    const children = (childrenMap.get(id) ?? []).sort(
      (a, b) => (folderMap.get(a)?.name ?? "").localeCompare(folderMap.get(b)?.name ?? ""),
    );
    for (const childId of children) dfs(childId, depth + 1);
  }

  for (const rootId of rootIds) dfs(rootId, 0);
  return result;
}
