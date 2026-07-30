import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import { validateGetActorOutput, type ActorDocument } from "./actors.js";
import { validateGetJournalOutput, validateGetJournalPageOutput, type GetJournalPageOutput, type JournalDocument } from "./journals.js";
import { validateGetSceneOutput, type SceneDocument } from "./scenes.js";

export const RESOLVE_UUID_CAPABILITY = "resolveUuid" as const;

export type ResolvedDocumentType = "actor" | "journal" | "journalPage" | "scene";

export interface ResolveUuidInput { uuid: string }

export interface ResolveUuidOutput {
  sourceId: string;
  sourceName: string;
  uuid: string;
  documentType: ResolvedDocumentType;
  document: ActorDocument | JournalDocument | GetJournalPageOutput | SceneDocument;
}

export const RESOLVE_UUID_DECLARATION: CapabilityDeclaration = { name: RESOLVE_UUID_CAPABILITY, mode: "read", version: "0.1" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const DOCUMENT_TYPES: ResolvedDocumentType[] = ["actor", "journal", "journalPage", "scene"];

export function validateResolveUuidInput(value: unknown): ValidationResult<ResolveUuidInput> {
  if (!isRecord(value) || !isNonEmptyString(value.uuid)) return { valid: false, errors: ["uuid must be a non-empty string"] };
  return { valid: true, value: value as unknown as ResolveUuidInput, errors: [] };
}

export function validateResolveUuidOutput(value: unknown): ValidationResult<ResolveUuidOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.uuid)) errors.push("uuid is required");
  if (!DOCUMENT_TYPES.includes(value.documentType as ResolvedDocumentType)) errors.push("documentType must be one of: actor, journal, journalPage, scene");
  if (!isRecord(value.document)) {
    errors.push("document must be an object");
  } else if (errors.length === 0) {
    const docType = value.documentType as ResolvedDocumentType;
    const docResult = docType === "actor" ? validateGetActorOutput(value.document)
      : docType === "journal" ? validateGetJournalOutput(value.document)
      : docType === "journalPage" ? validateGetJournalPageOutput(value.document)
      : validateGetSceneOutput(value.document);
    if (!docResult.valid) errors.push(...docResult.errors.map((e) => `document.${e}`));
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as ResolveUuidOutput, errors };
}
