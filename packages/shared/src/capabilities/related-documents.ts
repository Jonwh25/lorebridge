import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { ResolvedDocumentType } from "./resolve-uuid.js";

export const GET_RELATED_DOCUMENTS_CAPABILITY = "getRelatedDocuments" as const;

export type RelationshipType =
  | "uuidLink"
  | "sceneLinkedJournal"
  | "sceneNote"
  | "sceneToken";

export interface RelatedDocument {
  uuid: string;
  documentType: ResolvedDocumentType;
  name: string;
  relationshipType: RelationshipType;
}

export interface GetRelatedDocumentsInput {
  uuid: string;
  limit?: number;
  types?: ResolvedDocumentType[];
}

export interface GetRelatedDocumentsOutput {
  sourceId: string;
  sourceName: string;
  uuid: string;
  documentType: ResolvedDocumentType;
  name: string;
  related: RelatedDocument[];
}

export const GET_RELATED_DOCUMENTS_DECLARATION: CapabilityDeclaration = {
  name: GET_RELATED_DOCUMENTS_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const DOCUMENT_TYPES: ResolvedDocumentType[] = ["actor", "journal", "journalPage", "scene"];
const RELATIONSHIP_TYPES: RelationshipType[] = [
  "uuidLink",
  "sceneLinkedJournal",
  "sceneNote",
  "sceneToken",
];

export function validateGetRelatedDocumentsInput(
  value: unknown,
): ValidationResult<GetRelatedDocumentsInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.uuid)) errors.push("uuid must be a non-empty string");
  if (value.limit !== undefined) {
    if (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50) {
      errors.push("limit must be an integer between 1 and 50");
    }
  }
  if (value.types !== undefined) {
    if (!Array.isArray(value.types) || value.types.length === 0) {
      errors.push("types must be a non-empty array");
    } else {
      (value.types as unknown[]).forEach((t, i) => {
        if (!DOCUMENT_TYPES.includes(t as ResolvedDocumentType)) {
          errors.push(`types[${i}] must be one of: actor, journal, journalPage, scene`);
        }
      });
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetRelatedDocumentsInput, errors: [] };
}

export function validateGetRelatedDocumentsOutput(
  value: unknown,
): ValidationResult<GetRelatedDocumentsOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.uuid)) errors.push("uuid is required");
  if (!DOCUMENT_TYPES.includes(value.documentType as ResolvedDocumentType)) {
    errors.push("documentType must be one of: actor, journal, journalPage, scene");
  }
  if (!isNonEmptyString(value.name)) errors.push("name is required");
  if (!Array.isArray(value.related)) {
    errors.push("related must be an array");
  } else {
    (value.related as unknown[]).forEach((item, i) => {
      if (!isRecord(item)) { errors.push(`related[${i}] must be an object`); return; }
      if (!isNonEmptyString(item.uuid)) errors.push(`related[${i}].uuid is required`);
      if (!DOCUMENT_TYPES.includes(item.documentType as ResolvedDocumentType)) {
        errors.push(`related[${i}].documentType must be one of: actor, journal, journalPage, scene`);
      }
      if (!isNonEmptyString(item.name)) errors.push(`related[${i}].name is required`);
      if (!RELATIONSHIP_TYPES.includes(item.relationshipType as RelationshipType)) {
        errors.push(`related[${i}].relationshipType must be one of: ${RELATIONSHIP_TYPES.join(", ")}`);
      }
    });
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetRelatedDocumentsOutput, errors: [] };
}
