import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";

export const SEARCH_JOURNALS_CAPABILITY = "searchJournals" as const;
export const GET_JOURNAL_CAPABILITY = "getJournal" as const;
export const GET_JOURNAL_PAGE_CAPABILITY = "getJournalPage" as const;

export interface SearchJournalsInput { query: string; limit?: number; mode?: VisibilityMode; folderId?: string }
export interface JournalSearchMatch {
  journalId: string;
  journalUuid: string;
  journalName: string;
  folderId?: string;
  folderName?: string;
  pageCount: number;
  matchedPageId?: string;
  matchedPageUuid?: string;
  matchedPageName?: string;
  matchedField: "journalName" | "pageName" | "pageText";
  excerpt?: string;
}
export interface SearchJournalsOutput { sourceId: string; sourceName: string; query: string; results: JournalSearchMatch[]; hiddenCount: number }
export interface GetJournalInput { journalId: string }
export interface GetJournalPageInput { journalId: string; pageId: string; mode?: VisibilityMode }
export interface JournalPage {
  id: string;
  uuid: string;
  name: string;
  type: string;
  sort: number;
  text?: { format: number; html: string; plainText: string };
  src?: string;
}
export interface JournalDocument { sourceId: string; sourceName: string; id: string; uuid: string; name: string; pages: JournalPage[] }
export type GetJournalOutput = JournalDocument;
export interface GetJournalPageOutput {
  sourceId: string;
  sourceName: string;
  journal: { id: string; uuid: string; name: string };
  page: JournalPage;
}

export const SEARCH_JOURNALS_DECLARATION: CapabilityDeclaration = { name: SEARCH_JOURNALS_CAPABILITY, mode: "read", version: "0.1" };
export const GET_JOURNAL_DECLARATION: CapabilityDeclaration = { name: GET_JOURNAL_CAPABILITY, mode: "read", version: "0.1" };
export const GET_JOURNAL_PAGE_DECLARATION: CapabilityDeclaration = { name: GET_JOURNAL_PAGE_CAPABILITY, mode: "read", version: "0.1" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const VISIBILITY_MODES: VisibilityMode[] = ["gm", "player"];

export function validateSearchJournalsInput(value: unknown): ValidationResult<SearchJournalsInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)) errors.push("limit must be an integer between 1 and 50");
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) errors.push("mode must be 'gm' or 'player'");
  if (value.folderId !== undefined && !isNonEmptyString(value.folderId)) errors.push("folderId must be a non-empty string");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchJournalsInput, errors: [] };
}

export function validateSearchJournalsOutput(value: unknown): ValidationResult<SearchJournalsOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!Array.isArray(value.results)) errors.push("results must be an array");
  else value.results.forEach((result, index) => {
    if (!isRecord(result)) return errors.push(`results[${index}] must be an object`);
    for (const key of ["journalId", "journalUuid", "journalName"] as const) if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
    if (result.folderId !== undefined && typeof result.folderId !== "string") errors.push(`results[${index}].folderId must be a string`);
    if (result.folderName !== undefined && typeof result.folderName !== "string") errors.push(`results[${index}].folderName must be a string`);
    if (!Number.isInteger(result.pageCount) || (result.pageCount as number) < 0) errors.push(`results[${index}].pageCount must be a non-negative integer`);
    if (!["journalName", "pageName", "pageText"].includes(String(result.matchedField))) errors.push(`results[${index}].matchedField is invalid`);
    if (result.matchedPageUuid !== undefined && typeof result.matchedPageUuid !== "string") errors.push(`results[${index}].matchedPageUuid must be a string`);
  });
  if (typeof value.hiddenCount !== "number" || !Number.isInteger(value.hiddenCount) || (value.hiddenCount as number) < 0) errors.push("hiddenCount must be a non-negative integer");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchJournalsOutput, errors: [] };
}

export function validateGetJournalInput(value: unknown): ValidationResult<GetJournalInput> {
  if (!isRecord(value) || !isNonEmptyString(value.journalId)) return { valid: false, errors: ["journalId must be a non-empty string"] };
  return { valid: true, value: value as unknown as GetJournalInput, errors: [] };
}

export function validateGetJournalPageInput(value: unknown): ValidationResult<GetJournalPageInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.journalId)) errors.push("journalId must be a non-empty string");
  if (!isNonEmptyString(value.pageId)) errors.push("pageId must be a non-empty string");
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) errors.push("mode must be 'gm' or 'player'");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetJournalPageInput, errors };
}

export function validateGetJournalOutput(value: unknown): ValidationResult<GetJournalOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  for (const key of ["sourceId", "sourceName", "id", "uuid", "name"] as const) if (!isNonEmptyString(value[key])) errors.push(`${key} is required`);
  if (!Array.isArray(value.pages)) errors.push("pages must be an array");
  else value.pages.forEach((page, index) => {
    if (!isRecord(page)) return errors.push(`pages[${index}] must be an object`);
    for (const key of ["id", "uuid", "name", "type"] as const) if (!isNonEmptyString(page[key])) errors.push(`pages[${index}].${key} is required`);
    if (typeof page.sort !== "number") errors.push(`pages[${index}].sort must be a number`);
  });
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetJournalOutput, errors: [] };
}

export function validateGetJournalPageOutput(value: unknown): ValidationResult<GetJournalPageOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isRecord(value.journal)) errors.push("journal must be an object");
  else for (const key of ["id", "uuid", "name"] as const) if (!isNonEmptyString(value.journal[key])) errors.push(`journal.${key} is required`);
  if (!isRecord(value.page)) errors.push("page must be an object");
  else {
    for (const key of ["id", "uuid", "name", "type"] as const) if (!isNonEmptyString(value.page[key])) errors.push(`page.${key} is required`);
    if (typeof value.page.sort !== "number") errors.push("page.sort must be a number");
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetJournalPageOutput, errors: [] };
}
