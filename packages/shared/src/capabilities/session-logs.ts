import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const SEARCH_SESSION_LOGS_CAPABILITY = "searchSessionLogs" as const;
export const GET_SESSION_LOG_CAPABILITY = "getSessionLog" as const;

export interface SearchSessionLogsInput {
  query: string;
  limit?: number;
}

export interface SessionLogMatch {
  journalId: string;
  journalUuid: string;
  journalName: string;
  pageId: string;
  pageUuid: string;
  pageName: string;
  sessionNumber?: number;
  matchedField: "pageName" | "content";
  excerpt?: string;
}

export interface SearchSessionLogsOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  folderName: string;
  results: SessionLogMatch[];
}

export interface GetSessionLogInput {
  journalId: string;
  pageId: string;
}

export interface SessionLogPage {
  sourceId: string;
  sourceName: string;
  journalId: string;
  journalUuid: string;
  journalName: string;
  pageId: string;
  pageUuid: string;
  pageName: string;
  sessionNumber?: number;
  plainText: string;
}

export type GetSessionLogOutput = SessionLogPage;

export const SEARCH_SESSION_LOGS_DECLARATION: CapabilityDeclaration = {
  name: SEARCH_SESSION_LOGS_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const GET_SESSION_LOG_DECLARATION: CapabilityDeclaration = {
  name: GET_SESSION_LOG_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateSearchSessionLogsInput(
  value: unknown,
): ValidationResult<SearchSessionLogsInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (
    value.limit !== undefined
    && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)
  ) {
    errors.push("limit must be an integer between 1 and 50");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchSessionLogsInput, errors: [] };
}

export function validateSearchSessionLogsOutput(
  value: unknown,
): ValidationResult<SearchSessionLogsOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!isNonEmptyString(value.folderName)) errors.push("folderName is required");
  if (!Array.isArray(value.results)) {
    errors.push("results must be an array");
  } else {
    value.results.forEach((result, index) => {
      if (!isRecord(result)) { errors.push(`results[${index}] must be an object`); return; }
      for (const key of ["journalId", "journalUuid", "journalName", "pageId", "pageUuid", "pageName"] as const) {
        if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
      }
      if (!["pageName", "content"].includes(String(result.matchedField))) {
        errors.push(`results[${index}].matchedField must be 'pageName' or 'content'`);
      }
      if (result.sessionNumber !== undefined && (typeof result.sessionNumber !== "number" || !Number.isInteger(result.sessionNumber))) {
        errors.push(`results[${index}].sessionNumber must be an integer`);
      }
      if (result.excerpt !== undefined && typeof result.excerpt !== "string") {
        errors.push(`results[${index}].excerpt must be a string`);
      }
    });
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchSessionLogsOutput, errors: [] };
}

export function validateGetSessionLogInput(
  value: unknown,
): ValidationResult<GetSessionLogInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.journalId)) errors.push("journalId must be a non-empty string");
  if (!isNonEmptyString(value.pageId)) errors.push("pageId must be a non-empty string");
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetSessionLogInput, errors: [] };
}

export function validateGetSessionLogOutput(
  value: unknown,
): ValidationResult<GetSessionLogOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  for (const key of ["sourceId", "sourceName", "journalId", "journalUuid", "journalName", "pageId", "pageUuid", "pageName"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`${key} is required`);
  }
  if (typeof value.plainText !== "string") errors.push("plainText must be a string");
  if (value.sessionNumber !== undefined && (typeof value.sessionNumber !== "number" || !Number.isInteger(value.sessionNumber))) {
    errors.push("sessionNumber must be an integer");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetSessionLogOutput, errors: [] };
}
