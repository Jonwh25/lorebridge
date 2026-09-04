import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";

export const LIST_FOLDERS_CAPABILITY = "listFolders" as const;
export const BROWSE_FOLDER_CAPABILITY = "browseFolder" as const;

export const FOLDER_SUPPORTED_TYPES = [
  "Actor", "Item", "JournalEntry", "Scene", "RollTable", "Playlist", "Macro",
] as const;

export type FolderDocumentType = (typeof FOLDER_SUPPORTED_TYPES)[number];

export interface ListFoldersInput {
  documentType: FolderDocumentType;
  mode?: VisibilityMode;
}

export interface FolderEntry {
  id: string;
  name: string;
  documentType: string;
  parentId?: string;
  depth: number;
  childFolderCount: number;
  documentCount: number;
}

export interface ListFoldersOutput {
  sourceId: string;
  sourceName: string;
  documentType: string;
  folders: FolderEntry[];
  hiddenCount: number;
}

export interface BrowseFolderInput {
  documentType: FolderDocumentType;
  folderId?: string;
  mode?: VisibilityMode;
}

export interface FolderDocumentSummary {
  id: string;
  uuid: string;
  name: string;
  type?: string;
  img?: string;
}

export interface BrowseFolderOutput {
  sourceId: string;
  sourceName: string;
  documentType: string;
  folderId?: string;
  folderName?: string;
  parentFolderId?: string;
  childFolders: FolderEntry[];
  documents: FolderDocumentSummary[];
  hiddenDocumentCount: number;
  truncated: boolean;
}

export const LIST_FOLDERS_DECLARATION: CapabilityDeclaration = {
  name: LIST_FOLDERS_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const BROWSE_FOLDER_DECLARATION: CapabilityDeclaration = {
  name: BROWSE_FOLDER_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const VISIBILITY_MODES: VisibilityMode[] = ["gm", "player"];
const SUPPORTED_TYPE_SET = new Set<string>(FOLDER_SUPPORTED_TYPES);

export function validateListFoldersInput(value: unknown): ValidationResult<ListFoldersInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.documentType) || !SUPPORTED_TYPE_SET.has(value.documentType as string)) {
    errors.push(`documentType must be one of: ${FOLDER_SUPPORTED_TYPES.join(", ")}`);
  }
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) {
    errors.push("mode must be 'gm' or 'player'");
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as ListFoldersInput, errors: [] };
}

function validateFolderEntry(entry: unknown, index: number, errors: string[]): void {
  if (!isRecord(entry)) { errors.push(`folders[${index}] must be an object`); return; }
  if (!isNonEmptyString(entry.id)) errors.push(`folders[${index}].id is required`);
  if (!isNonEmptyString(entry.name)) errors.push(`folders[${index}].name is required`);
  if (!isNonEmptyString(entry.documentType)) errors.push(`folders[${index}].documentType is required`);
  if (entry.parentId !== undefined && typeof entry.parentId !== "string") errors.push(`folders[${index}].parentId must be a string`);
  if (typeof entry.depth !== "number" || !Number.isInteger(entry.depth) || (entry.depth as number) < 0) errors.push(`folders[${index}].depth must be a non-negative integer`);
  if (typeof entry.childFolderCount !== "number" || !Number.isInteger(entry.childFolderCount) || (entry.childFolderCount as number) < 0) errors.push(`folders[${index}].childFolderCount must be a non-negative integer`);
  if (typeof entry.documentCount !== "number" || !Number.isInteger(entry.documentCount) || (entry.documentCount as number) < 0) errors.push(`folders[${index}].documentCount must be a non-negative integer`);
}

export function validateListFoldersOutput(value: unknown): ValidationResult<ListFoldersOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.documentType)) errors.push("documentType is required");
  if (!Array.isArray(value.folders)) {
    errors.push("folders must be an array");
  } else {
    value.folders.forEach((f, i) => validateFolderEntry(f, i, errors));
  }
  if (typeof value.hiddenCount !== "number" || !Number.isInteger(value.hiddenCount) || (value.hiddenCount as number) < 0) {
    errors.push("hiddenCount must be a non-negative integer");
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as ListFoldersOutput, errors: [] };
}

export function validateBrowseFolderInput(value: unknown): ValidationResult<BrowseFolderInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.documentType) || !SUPPORTED_TYPE_SET.has(value.documentType as string)) {
    errors.push(`documentType must be one of: ${FOLDER_SUPPORTED_TYPES.join(", ")}`);
  }
  if (value.folderId !== undefined && !isNonEmptyString(value.folderId)) {
    errors.push("folderId must be a non-empty string");
  }
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) {
    errors.push("mode must be 'gm' or 'player'");
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as BrowseFolderInput, errors: [] };
}

function validateFolderDocumentSummary(doc: unknown, index: number, errors: string[]): void {
  if (!isRecord(doc)) { errors.push(`documents[${index}] must be an object`); return; }
  if (!isNonEmptyString(doc.id)) errors.push(`documents[${index}].id is required`);
  if (!isNonEmptyString(doc.uuid)) errors.push(`documents[${index}].uuid is required`);
  if (!isNonEmptyString(doc.name)) errors.push(`documents[${index}].name is required`);
  if (doc.type !== undefined && typeof doc.type !== "string") errors.push(`documents[${index}].type must be a string`);
  if (doc.img !== undefined && typeof doc.img !== "string") errors.push(`documents[${index}].img must be a string`);
}

export function validateBrowseFolderOutput(value: unknown): ValidationResult<BrowseFolderOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.documentType)) errors.push("documentType is required");
  if (value.folderId !== undefined && typeof value.folderId !== "string") errors.push("folderId must be a string");
  if (value.folderName !== undefined && typeof value.folderName !== "string") errors.push("folderName must be a string");
  if (value.parentFolderId !== undefined && typeof value.parentFolderId !== "string") errors.push("parentFolderId must be a string");
  if (!Array.isArray(value.childFolders)) {
    errors.push("childFolders must be an array");
  } else {
    value.childFolders.forEach((f, i) => validateFolderEntry(f, i, errors));
  }
  if (!Array.isArray(value.documents)) {
    errors.push("documents must be an array");
  } else {
    value.documents.forEach((d, i) => validateFolderDocumentSummary(d, i, errors));
  }
  if (typeof value.hiddenDocumentCount !== "number" || !Number.isInteger(value.hiddenDocumentCount) || (value.hiddenDocumentCount as number) < 0) {
    errors.push("hiddenDocumentCount must be a non-negative integer");
  }
  if (typeof value.truncated !== "boolean") errors.push("truncated must be a boolean");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as BrowseFolderOutput, errors: [] };
}
