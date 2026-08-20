import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";

export const SEARCH_ROLL_TABLES_CAPABILITY = "searchRollTables" as const;

export interface SearchRollTablesInput {
  query: string;
  limit?: number;
  mode?: VisibilityMode;
  folderId?: string;
}

export interface RollTableSearchMatch {
  tableId: string;
  tableUuid: string;
  tableName: string;
  img?: string;
  folderId?: string;
  folderName?: string;
  description?: string;
  matchedField: "tableName" | "description";
}

export interface SearchRollTablesOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: RollTableSearchMatch[];
  hiddenCount: number;
}

export const SEARCH_ROLL_TABLES_DECLARATION: CapabilityDeclaration = {
  name: SEARCH_ROLL_TABLES_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const VISIBILITY_MODES: VisibilityMode[] = ["gm", "player"];

export function validateSearchRollTablesInput(
  value: unknown,
): ValidationResult<SearchRollTablesInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (
    value.limit !== undefined
    && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)
  ) {
    errors.push("limit must be an integer between 1 and 50");
  }
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) {
    errors.push("mode must be 'gm' or 'player'");
  }
  if (value.folderId !== undefined && !isNonEmptyString(value.folderId)) {
    errors.push("folderId must be a non-empty string");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchRollTablesInput, errors: [] };
}

export function validateSearchRollTablesOutput(
  value: unknown,
): ValidationResult<SearchRollTablesOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!Array.isArray(value.results)) {
    errors.push("results must be an array");
  } else {
    value.results.forEach((result, index) => {
      if (!isRecord(result)) { errors.push(`results[${index}] must be an object`); return; }
      for (const key of ["tableId", "tableUuid", "tableName"] as const) {
        if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
      }
      if (!["tableName", "description"].includes(String(result.matchedField))) {
        errors.push(`results[${index}].matchedField is invalid`);
      }
      if (result.img !== undefined && typeof result.img !== "string") {
        errors.push(`results[${index}].img must be a string`);
      }
      if (result.folderId !== undefined && typeof result.folderId !== "string") {
        errors.push(`results[${index}].folderId must be a string`);
      }
      if (result.folderName !== undefined && typeof result.folderName !== "string") {
        errors.push(`results[${index}].folderName must be a string`);
      }
      if (result.description !== undefined && typeof result.description !== "string") {
        errors.push(`results[${index}].description must be a string`);
      }
    });
  }
  if (
    typeof value.hiddenCount !== "number"
    || !Number.isInteger(value.hiddenCount)
    || (value.hiddenCount as number) < 0
  ) {
    errors.push("hiddenCount must be a non-negative integer");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchRollTablesOutput, errors: [] };
}
