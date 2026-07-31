import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const LIST_COMPENDIUMS_CAPABILITY = "listCompendiums" as const;
export const SEARCH_COMPENDIUM_CAPABILITY = "searchCompendium" as const;
export const GET_COMPENDIUM_ENTRY_CAPABILITY = "getCompendiumEntry" as const;

export interface ListCompendiumsInput {
  documentType?: string;
}

export interface CompendiumInfo {
  packId: string;
  label: string;
  documentType: string;
  entryCount: number;
}

export interface ListCompendiumsOutput {
  sourceId: string;
  sourceName: string;
  compendiums: CompendiumInfo[];
}

export interface SearchCompendiumInput {
  query: string;
  packId?: string;
  documentType?: string;
  limit?: number;
}

export interface CompendiumMatch {
  packId: string;
  packLabel: string;
  entryId: string;
  entryUuid: string;
  entryName: string;
  documentType: string;
  img?: string;
}

export interface SearchCompendiumOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: CompendiumMatch[];
}

export interface GetCompendiumEntryInput {
  packId: string;
  entryId: string;
}

export interface GetCompendiumEntryOutput {
  sourceId: string;
  sourceName: string;
  packId: string;
  packLabel: string;
  entryId: string;
  entryUuid: string;
  entryName: string;
  documentType: string;
  img?: string;
}

export const LIST_COMPENDIUMS_DECLARATION: CapabilityDeclaration = {
  name: LIST_COMPENDIUMS_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const SEARCH_COMPENDIUM_DECLARATION: CapabilityDeclaration = {
  name: SEARCH_COMPENDIUM_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const GET_COMPENDIUM_ENTRY_DECLARATION: CapabilityDeclaration = {
  name: GET_COMPENDIUM_ENTRY_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateListCompendiumsInput(
  value: unknown,
): ValidationResult<ListCompendiumsInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  const errors: string[] = [];
  if (value.documentType !== undefined && !isNonEmptyString(value.documentType)) {
    errors.push("documentType must be a non-empty string");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as ListCompendiumsInput, errors: [] };
}

function validateCompendiumInfo(item: unknown, index: number, errors: string[]): void {
  if (!isRecord(item)) { errors.push(`compendiums[${index}] must be an object`); return; }
  for (const key of ["packId", "label", "documentType"] as const) {
    if (!isNonEmptyString(item[key])) errors.push(`compendiums[${index}].${key} is required`);
  }
  if (typeof item.entryCount !== "number" || !Number.isInteger(item.entryCount) || (item.entryCount as number) < 0) {
    errors.push(`compendiums[${index}].entryCount must be a non-negative integer`);
  }
}

export function validateListCompendiumsOutput(
  value: unknown,
): ValidationResult<ListCompendiumsOutput> {
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!Array.isArray(value.compendiums)) {
    errors.push("compendiums must be an array");
  } else {
    value.compendiums.forEach((item, i) => validateCompendiumInfo(item, i, errors));
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as ListCompendiumsOutput, errors: [] };
}

export function validateSearchCompendiumInput(
  value: unknown,
): ValidationResult<SearchCompendiumInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (value.packId !== undefined && !isNonEmptyString(value.packId)) {
    errors.push("packId must be a non-empty string");
  }
  if (value.documentType !== undefined && !isNonEmptyString(value.documentType)) {
    errors.push("documentType must be a non-empty string");
  }
  if (
    value.limit !== undefined
    && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)
  ) {
    errors.push("limit must be an integer between 1 and 50");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchCompendiumInput, errors: [] };
}

function validateCompendiumMatch(item: unknown, index: number, errors: string[]): void {
  if (!isRecord(item)) { errors.push(`results[${index}] must be an object`); return; }
  for (const key of ["packId", "packLabel", "entryId", "entryUuid", "entryName", "documentType"] as const) {
    if (!isNonEmptyString(item[key])) errors.push(`results[${index}].${key} is required`);
  }
  if (item.img !== undefined && typeof item.img !== "string") {
    errors.push(`results[${index}].img must be a string`);
  }
}

export function validateSearchCompendiumOutput(
  value: unknown,
): ValidationResult<SearchCompendiumOutput> {
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!Array.isArray(value.results)) {
    errors.push("results must be an array");
  } else {
    value.results.forEach((item, i) => validateCompendiumMatch(item, i, errors));
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchCompendiumOutput, errors: [] };
}

export function validateGetCompendiumEntryInput(
  value: unknown,
): ValidationResult<GetCompendiumEntryInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(value.packId)) errors.push("packId must be a non-empty string");
  if (!isNonEmptyString(value.entryId)) errors.push("entryId must be a non-empty string");
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetCompendiumEntryInput, errors: [] };
}

export function validateGetCompendiumEntryOutput(
  value: unknown,
): ValidationResult<GetCompendiumEntryOutput> {
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  const errors: string[] = [];
  for (const key of ["sourceId", "sourceName", "packId", "packLabel", "entryId", "entryUuid", "entryName", "documentType"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`${key} is required`);
  }
  if (value.img !== undefined && typeof value.img !== "string") {
    errors.push("img must be a string");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetCompendiumEntryOutput, errors: [] };
}
