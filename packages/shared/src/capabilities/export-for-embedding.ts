import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const EXPORT_FOR_EMBEDDING_CAPABILITY = "exportForEmbedding" as const;

export type EmbeddingDocumentType = "journal" | "actor";

export interface EmbeddingItem {
  uuid: string;
  documentType: EmbeddingDocumentType;
  name: string;
  text: string;
}

export interface ExportForEmbeddingInput {
  types?: EmbeddingDocumentType[];
}

export interface ExportForEmbeddingOutput {
  sourceId: string;
  sourceName: string;
  items: EmbeddingItem[];
}

export const EXPORT_FOR_EMBEDDING_DECLARATION: CapabilityDeclaration = {
  name: EXPORT_FOR_EMBEDDING_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const EMBEDDING_DOCUMENT_TYPES: EmbeddingDocumentType[] = ["journal", "actor"];

export function validateExportForEmbeddingInput(value: unknown): ValidationResult<ExportForEmbeddingInput> {
  const errors: string[] = [];
  if (!isRecord(value) && value !== undefined && value !== null) {
    return { valid: false, errors: ["input must be an object"] };
  }
  const v = (isRecord(value) ? value : {}) as Record<string, unknown>;
  if (v.types !== undefined) {
    if (!Array.isArray(v.types) || (v.types as unknown[]).length === 0) {
      errors.push("types must be a non-empty array");
    } else {
      (v.types as unknown[]).forEach((t, i) => {
        if (!EMBEDDING_DOCUMENT_TYPES.includes(t as EmbeddingDocumentType)) {
          errors.push(`types[${i}] must be one of: journal, actor`);
        }
      });
    }
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: v as unknown as ExportForEmbeddingInput, errors: [] };
}

export function validateExportForEmbeddingOutput(value: unknown): ValidationResult<ExportForEmbeddingOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    (value.items as unknown[]).forEach((item, index) => {
      if (!isRecord(item)) return errors.push(`items[${index}] must be an object`);
      if (!isNonEmptyString(item.uuid)) errors.push(`items[${index}].uuid is required`);
      if (!EMBEDDING_DOCUMENT_TYPES.includes(item.documentType as EmbeddingDocumentType)) {
        errors.push(`items[${index}].documentType must be one of: journal, actor`);
      }
      if (!isNonEmptyString(item.name)) errors.push(`items[${index}].name is required`);
      if (typeof item.text !== "string") errors.push(`items[${index}].text must be a string`);
    });
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as ExportForEmbeddingOutput, errors: [] };
}
