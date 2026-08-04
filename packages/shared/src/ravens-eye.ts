import type { ValidationResult } from "./index.js";

// ---------------------------------------------------------------------------
// Version pinning — LoreBridge supports exactly this experimental release.
// ---------------------------------------------------------------------------

export const RAVENS_EYE_SPEC_VERSION = "0.1.0-experimental" as const;
export type RavensEyeSpecVersion = typeof RAVENS_EYE_SPEC_VERSION;

export const FOUNDRY_EXTENSION_NAMESPACE = "org.ravens-eye.foundry-vtt" as const;
export const DND5E_EXTENSION_NAMESPACE = "org.ravens-eye.dnd5e" as const;

// ---------------------------------------------------------------------------
// Core record vocabulary
// ---------------------------------------------------------------------------

export const RAVENS_EYE_RECORD_TYPES = [
  "place",
  "player-character",
  "npc",
  "entry",
  "table",
] as const;
export type RavensEyeRecordType = (typeof RAVENS_EYE_RECORD_TYPES)[number];

export const RAVENS_EYE_AUDIENCES = ["players", "facilitator"] as const;
export type RavensEyeAudience = (typeof RAVENS_EYE_AUDIENCES)[number];

// ---------------------------------------------------------------------------
// Stable ID patterns
// ---------------------------------------------------------------------------

const RECORD_ID_RE =
  /^(place|player-character|npc|entry|table):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CAMPAIGN_ID_RE =
  /^campaign:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FOLDER_ID_RE =
  /^foundry-folder:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCENE_ID_RE =
  /^foundry-scene:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLL_TABLE_ID_RE =
  /^foundry-roll-table:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXPORT_SCOPE_ID_RE =
  /^foundry-export-scope:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// TypeScript types — mirrors the Raven's Eye schemas
// ---------------------------------------------------------------------------

export interface RavensEyeRelationship {
  target: string;
  label: string;
  audience: RavensEyeAudience;
  [key: string]: unknown;
}

export interface RavensEyeSection {
  key: string;
  audience: RavensEyeAudience;
  [key: string]: unknown;
}

/** Validated shape of a core record's ravens-eye-metadata block. */
export interface RavensEyeCoreRecord {
  id: string;
  type: RavensEyeRecordType;
  audience: RavensEyeAudience;
  kind?: string;
  parent?: string;
  sections?: RavensEyeSection[];
  relationships?: RavensEyeRelationship[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RavensEyeGameSystem {
  id: string;
  rulesRevision: string;
  extensionVersion: string;
  [key: string]: unknown;
}

export interface RavensEyeCampaignManifest {
  specification: RavensEyeSpecVersion;
  id: string;
  name: string;
  playFormat: "campaign" | "one-shot";
  coverage: "complete" | "partial";
  gameSystem: RavensEyeGameSystem;
  extensions?: Array<{ id: string; version: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface FoundrySourceDocument {
  type: string;
  id: string;
  uuid: string;
  [key: string]: unknown;
}

export interface FoundryFolderResource {
  id: string;
  type: "folder";
  sourceDocument: FoundrySourceDocument;
  documentType: string;
  name: string;
  sort: number;
  parent?: string;
  [key: string]: unknown;
}

export interface FoundryGridData {
  type: number;
  size: number;
  distance: number;
  units: string;
  [key: string]: unknown;
}

export interface FoundrySceneStructure {
  foundrySourceData: {
    name: string;
    navigation: boolean;
    grid: FoundryGridData;
    background: { src: string; [key: string]: unknown };
    walls: unknown[];
    lights: unknown[];
    drawings: unknown[];
    tiles: unknown[];
    regions: unknown[];
    tokens: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FoundrySceneReference {
  role: string;
  sourceUuid: string;
  target: string;
  [key: string]: unknown;
}

export interface FoundrySceneResource {
  id: string;
  type: "scene";
  sourceDocument: FoundrySourceDocument;
  profile: "structure" | "session-snapshot";
  structure: FoundrySceneStructure;
  folder?: string;
  place?: string;
  references?: FoundrySceneReference[];
  sessionSnapshot?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FoundryRollTableResult {
  sourceId: string;
  range: [number, number];
  weight: number;
  drawn: boolean;
  [key: string]: unknown;
}

export interface FoundryRollTableResource {
  id: string;
  type: "roll-table";
  sourceDocument: FoundrySourceDocument;
  coreRecord: string;
  formula: string;
  replacement: boolean;
  displayRoll: boolean;
  results: FoundryRollTableResult[];
  [key: string]: unknown;
}

export interface FoundryExportScope {
  id: string;
  type: "export-scope";
  mode: "selected-folders";
  selectedFolders: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Credential-like field names that must not appear in extension blocks.
const SECRET_FIELD_NAMES = new Set([
  "password",
  "passwd",
  "secret",
  "apikey",
  "token",
  "credential",
  "credentials",
  "privatekey",
  "accesstoken",
  "authtoken",
  "secretkey",
  "signingkey",
  "bearertoken",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

function scanPrototypePollution(obj: Record<string, unknown>, prefix: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      errors.push(`${prefix}: key "${key}" is not permitted`);
    }
    const val = obj[key];
    if (isRecord(val)) {
      scanPrototypePollution(val, `${prefix}.${key}`, errors);
    }
  }
}

function scanSecretFields(obj: Record<string, unknown>, prefix: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (SECRET_FIELD_NAMES.has(normalizeKey(key))) {
      errors.push(`${prefix}: field "${key}" must not appear in backup data`);
    }
  }
}

function checkPathTraversal(value: string, field: string, errors: string[]): void {
  if (value.includes("..") && (value.includes("/") || value.includes("\\"))) {
    errors.push(`${field}: path traversal sequence is not permitted`);
  }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isValidRecordId = (value: unknown): value is string =>
  typeof value === "string" && RECORD_ID_RE.test(value);

const isValidFolderId = (value: unknown): value is string =>
  typeof value === "string" && FOLDER_ID_RE.test(value);

function ok<T>(value: T): ValidationResult<T> {
  return { valid: true, value, errors: [] };
}

function fail<T>(errors: string[]): ValidationResult<T> {
  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Campaign manifest
// ---------------------------------------------------------------------------

/**
 * Validates the content of a parsed ravens-eye.yaml campaign manifest.
 * Specification must be exactly {@link RAVENS_EYE_SPEC_VERSION}.
 */
export function validateCampaignManifest(
  value: unknown,
): ValidationResult<RavensEyeCampaignManifest> {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(["campaign manifest must be an object"]);

  scanPrototypePollution(value, "manifest", errors);

  if (value.specification !== RAVENS_EYE_SPEC_VERSION) {
    errors.push(
      `specification must be "${RAVENS_EYE_SPEC_VERSION}"; got ${JSON.stringify(value.specification)}`,
    );
  }
  if (!isNonEmptyString(value.id) || !CAMPAIGN_ID_RE.test(value.id)) {
    errors.push("id must match campaign:<uuidv4>");
  }
  if (!isNonEmptyString(value.name)) {
    errors.push("name must be a non-empty string");
  }
  if (value.playFormat !== "campaign" && value.playFormat !== "one-shot") {
    errors.push('playFormat must be "campaign" or "one-shot"');
  }
  if (value.coverage !== "complete" && value.coverage !== "partial") {
    errors.push('coverage must be "complete" or "partial"');
  }

  const gs = value.gameSystem;
  if (!isRecord(gs)) {
    errors.push("gameSystem must be an object");
  } else {
    if (!isNonEmptyString(gs.id)) errors.push("gameSystem.id must be a non-empty string");
    if (!isNonEmptyString(gs.rulesRevision))
      errors.push("gameSystem.rulesRevision must be a non-empty string");
    if (!isNonEmptyString(gs.extensionVersion))
      errors.push("gameSystem.extensionVersion must be a non-empty string");
  }

  return errors.length === 0
    ? ok(value as unknown as RavensEyeCampaignManifest)
    : fail(errors);
}

// ---------------------------------------------------------------------------
// Core record metadata
// ---------------------------------------------------------------------------

/**
 * Validates the YAML extracted from a record's ravens-eye-metadata comment.
 * Preserves all fields (preserve-or-refuse rule). Returns the value unchanged
 * on success so round-trips preserve stable IDs, relationships, and audience.
 */
export function validateCoreRecord(value: unknown): ValidationResult<RavensEyeCoreRecord> {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(["core record metadata must be an object"]);

  scanPrototypePollution(value, "record", errors);

  if (!isValidRecordId(value.id)) {
    errors.push("id must match <type>:<uuidv4>");
  }
  if (!RAVENS_EYE_RECORD_TYPES.includes(value.type as RavensEyeRecordType)) {
    errors.push(
      `type must be one of: ${RAVENS_EYE_RECORD_TYPES.join(", ")}`,
    );
  }
  if (!RAVENS_EYE_AUDIENCES.includes(value.audience as RavensEyeAudience)) {
    errors.push('audience must be "players" or "facilitator"');
  }

  if (value.relationships !== undefined) {
    if (!Array.isArray(value.relationships)) {
      errors.push("relationships must be an array");
    } else {
      value.relationships.forEach((rel: unknown, i: number) => {
        if (!isRecord(rel)) {
          errors.push(`relationships[${i}] must be an object`);
          return;
        }
        if (!isValidRecordId(rel.target)) {
          errors.push(`relationships[${i}].target must match <type>:<uuidv4>`);
        }
        if (!isNonEmptyString(rel.label)) {
          errors.push(`relationships[${i}].label must be a non-empty string`);
        }
        if (!RAVENS_EYE_AUDIENCES.includes(rel.audience as RavensEyeAudience)) {
          errors.push(`relationships[${i}].audience must be "players" or "facilitator"`);
        }
      });
    }
  }

  if (value.sections !== undefined) {
    if (!Array.isArray(value.sections)) {
      errors.push("sections must be an array");
    } else {
      value.sections.forEach((sec: unknown, i: number) => {
        if (!isRecord(sec)) {
          errors.push(`sections[${i}] must be an object`);
          return;
        }
        if (!isNonEmptyString(sec.key)) {
          errors.push(`sections[${i}].key must be a non-empty string`);
        }
        if (!RAVENS_EYE_AUDIENCES.includes(sec.audience as RavensEyeAudience)) {
          errors.push(`sections[${i}].audience must be "players" or "facilitator"`);
        }
      });
    }
  }

  if (value.parent !== undefined && !isValidRecordId(value.parent)) {
    errors.push("parent must match <type>:<uuidv4>");
  }

  if (isRecord(value.extensions)) {
    scanSecretFields(value.extensions, "extensions", errors);
    scanPrototypePollution(value.extensions, "extensions", errors);
  }

  return errors.length === 0
    ? ok(value as unknown as RavensEyeCoreRecord)
    : fail(errors);
}

// ---------------------------------------------------------------------------
// Foundry extension on a core record (inline journal provenance)
// ---------------------------------------------------------------------------

/**
 * Validates the org.ravens-eye.foundry-vtt extension block stored inside a
 * core entry record's extensions object (journal-entry provenance profile).
 */
export function validateFoundryJournalExtension(
  value: unknown,
): ValidationResult<Record<string, unknown>> {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(["foundry journal extension must be an object"]);

  scanPrototypePollution(value, "foundry-extension", errors);

  const src = value.sourceDocument;
  if (!isRecord(src)) {
    errors.push("sourceDocument must be an object");
  } else {
    if (src.type !== "JournalEntry") errors.push("sourceDocument.type must be JournalEntry");
    if (!isNonEmptyString(src.id)) errors.push("sourceDocument.id must be a non-empty string");
    if (
      !isNonEmptyString(src.uuid) ||
      !(src.uuid as string).startsWith("JournalEntry.")
    ) {
      errors.push("sourceDocument.uuid must begin with JournalEntry.");
    }
  }

  if (!Array.isArray(value.pages)) {
    errors.push("pages must be an array");
  } else {
    (value.pages as unknown[]).forEach((page: unknown, i: number) => {
      if (!isRecord(page)) {
        errors.push(`pages[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(page.section)) {
        errors.push(`pages[${i}].section must be a non-empty string`);
      }
      if (typeof page.sort !== "number") {
        errors.push(`pages[${i}].sort must be a number`);
      }
      const pageSrc = page.sourceDocument;
      if (!isRecord(pageSrc)) {
        errors.push(`pages[${i}].sourceDocument must be an object`);
      } else {
        if (pageSrc.type !== "JournalEntryPage") {
          errors.push(`pages[${i}].sourceDocument.type must be JournalEntryPage`);
        }
        if (!isNonEmptyString(pageSrc.id)) {
          errors.push(`pages[${i}].sourceDocument.id must be a non-empty string`);
        }
        if (
          !isNonEmptyString(pageSrc.uuid) ||
          !(pageSrc.uuid as string).includes(".JournalEntryPage.")
        ) {
          errors.push(`pages[${i}].sourceDocument.uuid must include .JournalEntryPage.`);
        }
      }
      if (page.mediaReference !== undefined && !isNonEmptyString(page.mediaReference)) {
        errors.push(`pages[${i}].mediaReference must be a non-empty string when present`);
      }
    });
  }

  return errors.length === 0
    ? ok(value as Record<string, unknown>)
    : fail(errors);
}

// ---------------------------------------------------------------------------
// Foundry folder resource
// ---------------------------------------------------------------------------

function validateSourceDocument(
  src: unknown,
  expectedType: string,
  uuidPrefix: string,
  prefix: string,
  errors: string[],
): void {
  if (!isRecord(src)) {
    errors.push(`${prefix}.sourceDocument must be an object`);
    return;
  }
  if (src.type !== expectedType) {
    errors.push(`${prefix}.sourceDocument.type must be ${expectedType}`);
  }
  if (!isNonEmptyString(src.id)) {
    errors.push(`${prefix}.sourceDocument.id must be a non-empty string`);
  }
  if (!isNonEmptyString(src.uuid) || !(src.uuid as string).startsWith(uuidPrefix)) {
    errors.push(`${prefix}.sourceDocument.uuid must begin with ${uuidPrefix}`);
  }
}

/** Validates a standalone Foundry folder resource YAML. */
export function validateFoundryFolderResource(
  value: unknown,
): ValidationResult<FoundryFolderResource> {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(["folder resource must be an object"]);

  scanPrototypePollution(value, "folder", errors);

  if (!isNonEmptyString(value.id) || !FOLDER_ID_RE.test(value.id)) {
    errors.push("id must match foundry-folder:<uuidv4>");
  }
  if (value.type !== "folder") {
    errors.push('type must be "folder"');
  }
  validateSourceDocument(value.sourceDocument, "Folder", "Folder.", "folder", errors);
  if (!isNonEmptyString(value.documentType)) {
    errors.push("documentType must be a non-empty string");
  }
  if (!isNonEmptyString(value.name)) {
    errors.push("name must be a non-empty string");
  }
  if (typeof value.sort !== "number") {
    errors.push("sort must be a number");
  }
  if (value.parent !== undefined && !isValidFolderId(value.parent)) {
    errors.push("parent must match foundry-folder:<uuidv4>");
  }

  return errors.length === 0
    ? ok(value as unknown as FoundryFolderResource)
    : fail(errors);
}

// ---------------------------------------------------------------------------
// Foundry scene resource
// ---------------------------------------------------------------------------

/** Validates a standalone Foundry scene resource YAML. */
export function validateFoundrySceneResource(
  value: unknown,
): ValidationResult<FoundrySceneResource> {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(["scene resource must be an object"]);

  scanPrototypePollution(value, "scene", errors);

  if (!isNonEmptyString(value.id) || !SCENE_ID_RE.test(value.id)) {
    errors.push("id must match foundry-scene:<uuidv4>");
  }
  if (value.type !== "scene") {
    errors.push('type must be "scene"');
  }
  validateSourceDocument(value.sourceDocument, "Scene", "Scene.", "scene", errors);

  if (value.profile !== "structure" && value.profile !== "session-snapshot") {
    errors.push('profile must be "structure" or "session-snapshot"');
  }

  const structure = value.structure;
  if (!isRecord(structure)) {
    errors.push("structure must be an object");
  } else {
    const fsd = structure.foundrySourceData;
    if (!isRecord(fsd)) {
      errors.push("structure.foundrySourceData must be an object");
    } else {
      if (!isNonEmptyString(fsd.name)) errors.push("structure.foundrySourceData.name is required");
      if (typeof fsd.navigation !== "boolean")
        errors.push("structure.foundrySourceData.navigation must be a boolean");

      const grid = fsd.grid;
      if (!isRecord(grid)) {
        errors.push("structure.foundrySourceData.grid must be an object");
      } else {
        if (!Number.isInteger(grid.type)) errors.push("grid.type must be an integer");
        if (typeof grid.size !== "number" || grid.size < 0)
          errors.push("grid.size must be a non-negative number");
        if (typeof grid.distance !== "number" || grid.distance < 0)
          errors.push("grid.distance must be a non-negative number");
        if (!isNonEmptyString(grid.units)) errors.push("grid.units must be a non-empty string");
      }

      const bg = fsd.background;
      if (!isRecord(bg)) {
        errors.push("structure.foundrySourceData.background must be an object");
      } else {
        if (!isNonEmptyString(bg.src)) {
          errors.push("background.src must be a non-empty string");
        } else {
          checkPathTraversal(bg.src as string, "background.src", errors);
        }
      }

      for (const field of ["walls", "lights", "drawings", "tiles", "regions", "tokens"] as const) {
        if (!Array.isArray(fsd[field])) {
          errors.push(`structure.foundrySourceData.${field} must be an array`);
        }
      }
    }
  }

  if (value.folder !== undefined && !isValidFolderId(value.folder)) {
    errors.push("folder must match foundry-folder:<uuidv4>");
  }
  if (value.place !== undefined && !isValidRecordId(value.place)) {
    errors.push("place must match <type>:<uuidv4>");
  }

  if (value.profile === "session-snapshot" && !isRecord(value.sessionSnapshot)) {
    errors.push("sessionSnapshot is required when profile is session-snapshot");
  }
  if (value.profile === "structure" && value.sessionSnapshot !== undefined) {
    errors.push("sessionSnapshot must not be present when profile is structure");
  }

  if (value.references !== undefined) {
    if (!Array.isArray(value.references)) {
      errors.push("references must be an array");
    } else {
      (value.references as unknown[]).forEach((ref: unknown, i: number) => {
        if (!isRecord(ref)) {
          errors.push(`references[${i}] must be an object`);
          return;
        }
        if (!isNonEmptyString(ref.role)) errors.push(`references[${i}].role is required`);
        if (!isNonEmptyString(ref.sourceUuid))
          errors.push(`references[${i}].sourceUuid is required`);
        if (!isValidRecordId(ref.target))
          errors.push(`references[${i}].target must match <type>:<uuidv4>`);
      });
    }
  }

  return errors.length === 0
    ? ok(value as unknown as FoundrySceneResource)
    : fail(errors);
}

// ---------------------------------------------------------------------------
// Foundry roll-table resource
// ---------------------------------------------------------------------------

/** Validates a standalone Foundry roll-table resource YAML. */
export function validateFoundryRollTableResource(
  value: unknown,
): ValidationResult<FoundryRollTableResource> {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(["roll-table resource must be an object"]);

  scanPrototypePollution(value, "roll-table", errors);

  if (!isNonEmptyString(value.id) || !ROLL_TABLE_ID_RE.test(value.id)) {
    errors.push("id must match foundry-roll-table:<uuidv4>");
  }
  if (value.type !== "roll-table") {
    errors.push('type must be "roll-table"');
  }
  validateSourceDocument(value.sourceDocument, "RollTable", "RollTable.", "roll-table", errors);

  const tableIdRe =
    /^table:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!isNonEmptyString(value.coreRecord) || !tableIdRe.test(value.coreRecord)) {
    errors.push("coreRecord must match table:<uuidv4>");
  }
  if (!isNonEmptyString(value.formula)) {
    errors.push("formula must be a non-empty string");
  }
  if (typeof value.replacement !== "boolean") {
    errors.push("replacement must be a boolean");
  }
  if (typeof value.displayRoll !== "boolean") {
    errors.push("displayRoll must be a boolean");
  }

  if (!Array.isArray(value.results)) {
    errors.push("results must be an array");
  } else {
    (value.results as unknown[]).forEach((result: unknown, i: number) => {
      if (!isRecord(result)) {
        errors.push(`results[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(result.sourceId)) {
        errors.push(`results[${i}].sourceId must be a non-empty string`);
      }
      if (
        !Array.isArray(result.range) ||
        result.range.length !== 2 ||
        !Number.isInteger(result.range[0]) ||
        !Number.isInteger(result.range[1])
      ) {
        errors.push(`results[${i}].range must be [integer, integer]`);
      }
      if (!Number.isInteger(result.weight) || (result.weight as number) < 0) {
        errors.push(`results[${i}].weight must be a non-negative integer`);
      }
      if (typeof result.drawn !== "boolean") {
        errors.push(`results[${i}].drawn must be a boolean`);
      }
    });
  }

  return errors.length === 0
    ? ok(value as unknown as FoundryRollTableResource)
    : fail(errors);
}

// ---------------------------------------------------------------------------
// Foundry export scope
// ---------------------------------------------------------------------------

/** Validates a foundry-vtt export-scope YAML (folder-selection mode). */
export function validateFoundryExportScope(
  value: unknown,
): ValidationResult<FoundryExportScope> {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(["export scope must be an object"]);

  scanPrototypePollution(value, "export-scope", errors);

  if (!isNonEmptyString(value.id) || !EXPORT_SCOPE_ID_RE.test(value.id)) {
    errors.push("id must match foundry-export-scope:<uuidv4>");
  }
  if (value.type !== "export-scope") {
    errors.push('type must be "export-scope"');
  }
  if (value.mode !== "selected-folders") {
    errors.push('mode must be "selected-folders"');
  }
  if (!Array.isArray(value.selectedFolders) || (value.selectedFolders as unknown[]).length === 0) {
    errors.push("selectedFolders must be a non-empty array");
  } else {
    (value.selectedFolders as unknown[]).forEach((fid: unknown, i: number) => {
      if (!isValidFolderId(fid)) {
        errors.push(`selectedFolders[${i}] must match foundry-folder:<uuidv4>`);
      }
    });
  }

  return errors.length === 0
    ? ok(value as unknown as FoundryExportScope)
    : fail(errors);
}
