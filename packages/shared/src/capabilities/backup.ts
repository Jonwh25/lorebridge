import type { ValidationResult } from "../index.js";

// ---------------------------------------------------------------------------
// Capability name
// ---------------------------------------------------------------------------

export const BACKUP_EXPORT_CAPABILITY = "backup/export" as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single file to be committed to GitHub. */
export interface BackupFileEntry {
  /** Path relative to the campaign root — no leading slash, no ".." segments. */
  path: string;
  /** UTF-8 text content. */
  content: string;
}

/** All document types that can be backed up. */
export type BackupDocumentType = "journals" | "scenes" | "actors" | "rolltables";

/**
 * Input to POST /v1/backup/github/export.
 * The Foundry module serializes the files and sends them here.
 * The backend validates paths and either previews or commits.
 */
export interface BackupExportInput {
  /** Document type being backed up. */
  type: BackupDocumentType;
  /** Exact Foundry folder name the GM selected. */
  folderName: string;
  /** Optional commit message; defaults to a generated description. */
  commitMessage?: string;
  /** true = preview only (no commit); false = commit to GitHub. */
  preview: boolean;
  /** Serialized files to preview or commit. */
  files: BackupFileEntry[];
}

/** Output from POST /v1/backup/github/export. */
export interface BackupExportOutput {
  preview: boolean;
  type: BackupDocumentType;
  folderName: string;
  files: BackupFileEntry[];
  /** Present when preview=false and commit succeeded. */
  commitSha?: string;
  /** Present when preview=false and commit succeeded. */
  commitUrl?: string;
  /** Non-fatal omissions, unsupported fields, asset inventory notices. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Restore types
// ---------------------------------------------------------------------------

export const BACKUP_RESTORE_SCENES_CAPABILITY = "backup/restore/scenes" as const;

/** A folder to recreate during scene restore. */
export interface RestoreFolderEntry {
  sidecarId: string;
  name: string;
  sort: number;
  /** Sidecar ID of the parent folder within this backup; absent = direct child of root. */
  parentSidecarId?: string;
}

/** A scene entry returned by the restore plan endpoint. */
export interface RestoreSceneEntry {
  sidecarId: string;
  /** Matches the `placeRavensEyeId` flag on the Foundry scene document. */
  placeId: string;
  folderSidecarId?: string;
  sceneName: string;
  foundrySourceData: Record<string, unknown>;
}

/** Output from GET /v1/backup/github/restore/scenes. */
export interface RestoreScenesOutput {
  commitSha: string;
  folderName: string;
  scenes: RestoreSceneEntry[];
  folders: RestoreFolderEntry[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

function isValidFilePath(filePath: string): boolean {
  if (!filePath || filePath.trim() === "") return false;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return false;
  const segments = filePath.replace(/\\/g, "/").split("/");
  return !segments.some((s) => s === "..");
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateBackupExportInput(value: unknown): ValidationResult<BackupExportInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };

  const validTypes: BackupDocumentType[] = ["journals", "scenes", "actors", "rolltables"];
  if (!validTypes.includes(value.type as BackupDocumentType)) {
    errors.push('type must be "journals", "scenes", "actors", or "rolltables"');
  }
  if (!isNonEmptyString(value.folderName)) errors.push("folderName must be a non-empty string");
  if (typeof value.preview !== "boolean") errors.push("preview must be a boolean");
  if (value.commitMessage !== undefined && typeof value.commitMessage !== "string") {
    errors.push("commitMessage must be a string when provided");
  }

  if (!Array.isArray(value.files)) {
    errors.push("files must be an array");
  } else {
    (value.files as unknown[]).forEach((file, i) => {
      if (!isRecord(file)) {
        errors.push(`files[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(file.path)) {
        errors.push(`files[${i}].path must be a non-empty string`);
      } else if (!isValidFilePath(file.path as string)) {
        errors.push(
          `files[${i}].path is invalid: absolute paths and path traversal are not permitted`,
        );
      }
      if (typeof file.content !== "string") {
        errors.push(`files[${i}].content must be a string`);
      }
    });
  }

  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as BackupExportInput, errors: [] };
}

export function validateBackupExportOutput(value: unknown): ValidationResult<BackupExportOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };

  if (typeof value.preview !== "boolean") errors.push("preview must be a boolean");
  const validTypes: BackupDocumentType[] = ["journals", "scenes", "actors", "rolltables"];
  if (!validTypes.includes(value.type as BackupDocumentType)) {
    errors.push('type must be "journals", "scenes", "actors", or "rolltables"');
  }
  if (!isNonEmptyString(value.folderName)) errors.push("folderName must be a non-empty string");
  if (!Array.isArray(value.files)) errors.push("files must be an array");
  if (!Array.isArray(value.warnings)) errors.push("warnings must be an array");
  if (value.commitSha !== undefined && typeof value.commitSha !== "string") {
    errors.push("commitSha must be a string when provided");
  }
  if (value.commitUrl !== undefined && typeof value.commitUrl !== "string") {
    errors.push("commitUrl must be a string when provided");
  }

  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as BackupExportOutput, errors: [] };
}
