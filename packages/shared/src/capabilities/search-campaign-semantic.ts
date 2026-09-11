import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const SEARCH_CAMPAIGN_SEMANTIC_CAPABILITY = "searchCampaignSemantic" as const;

export type SemanticDocumentType = "journal" | "actor";

export interface SearchCampaignSemanticInput {
  query: string;
  limit?: number;
  types?: SemanticDocumentType[];
  sourceId?: string;
}

export interface SemanticSearchResult {
  uuid: string;
  documentType: SemanticDocumentType;
  name: string;
  excerpt: string;
  score: number;
}

export interface SearchCampaignSemanticOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: SemanticSearchResult[];
}

export const SEARCH_CAMPAIGN_SEMANTIC_DECLARATION: CapabilityDeclaration = {
  name: SEARCH_CAMPAIGN_SEMANTIC_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const SEMANTIC_DOCUMENT_TYPES: SemanticDocumentType[] = ["journal", "actor"];

export function validateSearchCampaignSemanticInput(value: unknown): ValidationResult<SearchCampaignSemanticInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 20)) {
    errors.push("limit must be an integer between 1 and 20");
  }
  if (value.types !== undefined) {
    if (!Array.isArray(value.types) || value.types.length === 0) {
      errors.push("types must be a non-empty array");
    } else {
      (value.types as unknown[]).forEach((t, i) => {
        if (!SEMANTIC_DOCUMENT_TYPES.includes(t as SemanticDocumentType)) {
          errors.push(`types[${i}] must be one of: journal, actor`);
        }
      });
    }
  }
  if (value.sourceId !== undefined && !isNonEmptyString(value.sourceId)) {
    errors.push("sourceId must be a non-empty string");
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchCampaignSemanticInput, errors: [] };
}

export function validateSearchCampaignSemanticOutput(value: unknown): ValidationResult<SearchCampaignSemanticOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!Array.isArray(value.results)) {
    errors.push("results must be an array");
  } else {
    (value.results as unknown[]).forEach((r, i) => {
      if (!isRecord(r)) return errors.push(`results[${i}] must be an object`);
      if (!isNonEmptyString(r.uuid)) errors.push(`results[${i}].uuid is required`);
      if (!SEMANTIC_DOCUMENT_TYPES.includes(r.documentType as SemanticDocumentType)) {
        errors.push(`results[${i}].documentType must be one of: journal, actor`);
      }
      if (!isNonEmptyString(r.name)) errors.push(`results[${i}].name is required`);
      if (typeof r.excerpt !== "string") errors.push(`results[${i}].excerpt must be a string`);
      if (typeof r.score !== "number") errors.push(`results[${i}].score must be a number`);
    });
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchCampaignSemanticOutput, errors: [] };
}
