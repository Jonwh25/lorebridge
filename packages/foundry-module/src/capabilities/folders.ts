import {
  validateListFoldersInput,
  validateListFoldersOutput,
  validateBrowseFolderInput,
  validateBrowseFolderOutput,
  type ListFoldersInput,
  type ListFoldersOutput,
  type BrowseFolderInput,
  type BrowseFolderOutput,
  type FolderEntry,
  type FolderDocumentSummary,
  type FolderDocumentType,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";

const BROWSE_LIMIT = 200;

function sourceId(): string {
  if (!game.world) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry world is not fully initialized.",
      { retryable: true },
    );
  }
  return `foundry:${game.world.id}`;
}

function sourceName(): string {
  if (!game.world) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry world is not fully initialized.",
      { retryable: true },
    );
  }
  return game.world.title;
}

type FoundryFolder = {
  id: string;
  name: string;
  type: string;
  folder: FoundryFolder | null;
  children: FoundryFolder[];
  contents?: unknown[];
};

function folderDepth(folder: FoundryFolder): number {
  let depth = 0;
  let current: FoundryFolder | null = folder.folder;
  while (current) {
    depth++;
    current = current.folder;
  }
  return depth;
}

function toFolderEntry(folder: FoundryFolder): FolderEntry {
  const entry: FolderEntry = {
    id: folder.id,
    name: folder.name,
    documentType: folder.type,
    depth: folderDepth(folder),
    childFolderCount: Array.isArray(folder.children) ? folder.children.length : 0,
    documentCount: Array.isArray(folder.contents) ? folder.contents.length : 0,
  };
  if (folder.folder?.id) entry.parentId = folder.folder.id;
  return entry;
}

function getWorldCollection(documentType: FolderDocumentType): Iterable<{ id: string; uuid: string; name: string; type?: string; img?: string; ownership?: Record<string, number>; folder?: FoundryFolder | null }> | null {
  const g = game as unknown as Record<string, unknown>;
  const map: Partial<Record<FolderDocumentType, string>> = {
    Actor: "actors",
    Item: "items",
    JournalEntry: "journal",
    Scene: "scenes",
    RollTable: "tables",
    Playlist: "playlists",
    Macro: "macros",
  };
  const key = map[documentType];
  if (!key) return null;
  const col = g[key];
  if (!col || typeof col !== "object" || !Symbol.iterator) return null;
  return col as Iterable<{ id: string; uuid: string; name: string; type?: string; img?: string; ownership?: Record<string, number>; folder?: FoundryFolder | null }>;
}

export function listFolders(input: ListFoldersInput): ListFoldersOutput {
  requireFoundryGm("listFolders");
  const validated = validateListFoldersInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "List folders input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }

  if (!game.folders) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry folder collection is unavailable.",
      { retryable: true },
    );
  }

  const { documentType, mode } = validated.value;
  const playerMode = mode === "player";
  const collection = getWorldCollection(documentType);
  const playerVisibleDocIds = new Set<string>();
  let hiddenCount = 0;

  if (playerMode && collection) {
    for (const doc of collection) {
      if (isPlayerVisible((doc as { ownership?: Record<string, number> }).ownership)) {
        playerVisibleDocIds.add(doc.id);
      } else {
        hiddenCount++;
      }
    }
  }

  const allFolders = (game.folders as Iterable<FoundryFolder & { type: string }>);
  const typeFolders: FolderEntry[] = [];

  for (const folder of allFolders) {
    if (folder.type !== documentType) continue;
    if (playerMode) {
      const hasVisible = Array.isArray(folder.contents)
        ? (folder.contents as Array<{ id: string }>).some(d => playerVisibleDocIds.has(d.id))
        : false;
      if (!hasVisible && (Array.isArray(folder.children) ? folder.children.length === 0 : true)) continue;
    }
    typeFolders.push(toFolderEntry(folder));
  }

  typeFolders.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

  const output: ListFoldersOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    documentType,
    folders: typeFolders,
    hiddenCount,
  };

  const outputValidation = validateListFoldersOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid folder data.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}

export function browseFolder(input: BrowseFolderInput): BrowseFolderOutput {
  requireFoundryGm("browseFolder");
  const validated = validateBrowseFolderInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Browse folder input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }

  if (!game.folders) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry folder collection is unavailable.",
      { retryable: true },
    );
  }

  const { documentType, folderId, mode } = validated.value;
  const playerMode = mode === "player";
  const collection = getWorldCollection(documentType);

  let targetFolder: FoundryFolder | undefined;
  if (folderId) {
    for (const folder of (game.folders as Iterable<FoundryFolder & { type: string }>)) {
      if (folder.id === folderId && folder.type === documentType) {
        targetFolder = folder;
        break;
      }
    }
    if (!targetFolder) {
      throw new LoreBridgeCapabilityError(
        "NOT_FOUND",
        `Folder "${folderId}" was not found for document type "${documentType}".`,
      );
    }
  }

  const childFolders: FolderEntry[] = [];
  for (const folder of (game.folders as Iterable<FoundryFolder & { type: string }>)) {
    if (folder.type !== documentType) continue;
    const parentId = folder.folder?.id ?? null;
    const expectedParent = folderId ?? null;
    if (parentId !== expectedParent) continue;
    childFolders.push(toFolderEntry(folder));
  }
  childFolders.sort((a, b) => a.name.localeCompare(b.name));

  const documents: FolderDocumentSummary[] = [];
  let hiddenDocumentCount = 0;

  if (collection) {
    for (const doc of collection) {
      const docFolderId = (doc as { folder?: FoundryFolder | null }).folder?.id ?? null;
      const expectedFolderId = folderId ?? null;
      if (docFolderId !== expectedFolderId) continue;

      if (playerMode && !isPlayerVisible((doc as { ownership?: Record<string, number> }).ownership)) {
        hiddenDocumentCount++;
        continue;
      }

      const summary: FolderDocumentSummary = {
        id: doc.id,
        uuid: doc.uuid,
        name: doc.name,
      };
      if (doc.type) summary.type = doc.type;
      if (doc.img) summary.img = doc.img;
      documents.push(summary);

      if (documents.length >= BROWSE_LIMIT) break;
    }
  }

  documents.sort((a, b) => a.name.localeCompare(b.name));

  const output: BrowseFolderOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    documentType,
    childFolders,
    documents,
    hiddenDocumentCount,
    truncated: documents.length >= BROWSE_LIMIT,
  };

  if (targetFolder) {
    output.folderId = targetFolder.id;
    output.folderName = targetFolder.name;
    if (targetFolder.folder?.id) output.parentFolderId = targetFolder.folder.id;
  }

  const outputValidation = validateBrowseFolderOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid browse folder data.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}
