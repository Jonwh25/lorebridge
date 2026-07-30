import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const SEARCH_ACTORS_CAPABILITY = "searchActors" as const;
export const GET_ACTOR_CAPABILITY = "getActor" as const;

export interface SearchActorsInput {
  query: string;
  limit?: number;
  types?: string[];
}

export interface ActorSearchMatch {
  actorId: string;
  actorUuid: string;
  actorName: string;
  actorType: string;
  img?: string;
  folderName?: string;
  matchedField: "actorName" | "description";
  excerpt?: string;
}

export interface SearchActorsOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: ActorSearchMatch[];
}

export interface GetActorInput {
  actorId: string;
}

export interface ActorDocument {
  sourceId: string;
  sourceName: string;
  systemId: string;
  id: string;
  uuid: string;
  name: string;
  type: string;
  img?: string;
  folder?: { id: string; name: string };
  description?: { plainText: string };
}

export type GetActorOutput = ActorDocument;

export const SEARCH_ACTORS_DECLARATION: CapabilityDeclaration = {
  name: SEARCH_ACTORS_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const GET_ACTOR_DECLARATION: CapabilityDeclaration = {
  name: GET_ACTOR_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateSearchActorsInput(
  value: unknown,
): ValidationResult<SearchActorsInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (
    value.limit !== undefined
    && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)
  ) {
    errors.push("limit must be an integer between 1 and 50");
  }
  if (value.types !== undefined) {
    if (
      !Array.isArray(value.types)
      || value.types.length < 1
      || value.types.length > 20
      || value.types.some((type) => !isNonEmptyString(type))
    ) {
      errors.push("types must contain between 1 and 20 non-empty strings");
    }
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchActorsInput, errors };
}

export function validateSearchActorsOutput(
  value: unknown,
): ValidationResult<SearchActorsOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!Array.isArray(value.results)) errors.push("results must be an array");
  else {
    value.results.forEach((result, index) => {
      if (!isRecord(result)) {
        errors.push(`results[${index}] must be an object`);
        return;
      }
      for (const key of ["actorId", "actorUuid", "actorName", "actorType"] as const) {
        if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
      }
      if (!["actorName", "description"].includes(String(result.matchedField))) {
        errors.push(`results[${index}].matchedField is invalid`);
      }
      if (result.img !== undefined && typeof result.img !== "string") {
        errors.push(`results[${index}].img must be a string`);
      }
      if (result.excerpt !== undefined && typeof result.excerpt !== "string") {
        errors.push(`results[${index}].excerpt must be a string`);
      }
    });
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchActorsOutput, errors };
}

export function validateGetActorInput(value: unknown): ValidationResult<GetActorInput> {
  if (!isRecord(value) || !isNonEmptyString(value.actorId)) {
    return { valid: false, errors: ["actorId must be a non-empty string"] };
  }
  return { valid: true, value: value as unknown as GetActorInput, errors: [] };
}

export function validateGetActorOutput(value: unknown): ValidationResult<GetActorOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  for (const key of ["sourceId", "sourceName", "systemId", "id", "uuid", "name", "type"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`${key} is required`);
  }
  if (value.img !== undefined && typeof value.img !== "string") errors.push("img must be a string");
  if (value.folder !== undefined) {
    if (!isRecord(value.folder)) errors.push("folder must be an object");
    else {
      if (!isNonEmptyString(value.folder.id)) errors.push("folder.id is required");
      if (!isNonEmptyString(value.folder.name)) errors.push("folder.name is required");
    }
  }
  if (value.description !== undefined) {
    if (!isRecord(value.description) || typeof value.description.plainText !== "string") {
      errors.push("description.plainText must be a string");
    }
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetActorOutput, errors };
}
