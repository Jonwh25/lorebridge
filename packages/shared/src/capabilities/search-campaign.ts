import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";
import type { JournalSearchMatch } from "./journals.js";
import type { ActorSearchMatch } from "./actors.js";
import type { SceneSearchMatch } from "./scenes.js";

export const SEARCH_CAMPAIGN_CAPABILITY = "searchCampaign" as const;

export type CampaignDocumentType = "journal" | "actor" | "scene";

export type CampaignSearchMatch =
  | (JournalSearchMatch & { documentType: "journal" })
  | (ActorSearchMatch & { documentType: "actor" })
  | (SceneSearchMatch & { documentType: "scene" });

export interface SearchCampaignInput {
  query: string;
  limit?: number;
  types?: CampaignDocumentType[];
  mode?: VisibilityMode;
  folderId?: string;
  excludeFolderIds?: string[];
}

export interface SearchCampaignOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: CampaignSearchMatch[];
  hiddenCount: number;
}

export const SEARCH_CAMPAIGN_DECLARATION: CapabilityDeclaration = { name: SEARCH_CAMPAIGN_CAPABILITY, mode: "read", version: "0.1" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const DOCUMENT_TYPES: CampaignDocumentType[] = ["journal", "actor", "scene"];
const VISIBILITY_MODES: VisibilityMode[] = ["gm", "player"];

export function validateSearchCampaignInput(value: unknown): ValidationResult<SearchCampaignInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)) {
    errors.push("limit must be an integer between 1 and 50");
  }
  if (value.types !== undefined) {
    if (!Array.isArray(value.types) || value.types.length === 0) {
      errors.push("types must be a non-empty array");
    } else {
      value.types.forEach((t, i) => {
        if (!DOCUMENT_TYPES.includes(t as CampaignDocumentType)) errors.push(`types[${i}] must be one of: journal, actor, scene`);
      });
    }
  }
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) errors.push("mode must be 'gm' or 'player'");
  if (value.folderId !== undefined && (typeof value.folderId !== "string" || value.folderId.trim().length === 0)) errors.push("folderId must be a non-empty string");
  if (value.excludeFolderIds !== undefined) {
    if (!Array.isArray(value.excludeFolderIds) || value.excludeFolderIds.some((id) => typeof id !== "string" || id.trim().length === 0)) errors.push("excludeFolderIds must be an array of non-empty strings");
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchCampaignInput, errors: [] };
}

export function validateSearchCampaignOutput(value: unknown): ValidationResult<SearchCampaignOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!Array.isArray(value.results)) {
    errors.push("results must be an array");
  } else {
    value.results.forEach((result, index) => {
      if (!isRecord(result)) return errors.push(`results[${index}] must be an object`);
      if (!DOCUMENT_TYPES.includes(result.documentType as CampaignDocumentType)) {
        errors.push(`results[${index}].documentType must be one of: journal, actor, scene`);
        return;
      }
      const docType = result.documentType as CampaignDocumentType;
      if (docType === "journal") {
        for (const key of ["journalId", "journalUuid", "journalName"] as const) {
          if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
        }
        if (!Number.isInteger(result.pageCount) || (result.pageCount as number) < 0) errors.push(`results[${index}].pageCount must be a non-negative integer`);
        if (!["journalName", "pageName", "pageText"].includes(String(result.matchedField))) errors.push(`results[${index}].matchedField is invalid`);
      } else if (docType === "actor") {
        for (const key of ["actorId", "actorUuid", "actorName", "actorType"] as const) {
          if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
        }
        if (!["actorName", "description"].includes(String(result.matchedField))) errors.push(`results[${index}].matchedField is invalid`);
      } else if (docType === "scene") {
        for (const key of ["sceneId", "sceneUuid", "sceneName"] as const) {
          if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
        }
        if (typeof result.active !== "boolean") errors.push(`results[${index}].active must be a boolean`);
        if (typeof result.navigation !== "boolean") errors.push(`results[${index}].navigation must be a boolean`);
        if (result.matchedField !== "sceneName") errors.push(`results[${index}].matchedField is invalid`);
      }
    });
  }
  if (typeof value.hiddenCount !== "number" || !Number.isInteger(value.hiddenCount) || (value.hiddenCount as number) < 0) errors.push("hiddenCount must be a non-negative integer");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchCampaignOutput, errors: [] };
}
