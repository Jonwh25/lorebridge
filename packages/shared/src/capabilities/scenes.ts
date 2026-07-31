import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";

export const SEARCH_SCENES_CAPABILITY = "searchScenes" as const;
export const GET_SCENE_CAPABILITY = "getScene" as const;
export const GET_ACTIVE_SCENE_CAPABILITY = "getActiveScene" as const;

export interface SearchScenesInput { query: string; limit?: number; mode?: VisibilityMode }

export interface SceneSearchMatch {
  sceneId: string;
  sceneUuid: string;
  sceneName: string;
  active: boolean;
  navigation: boolean;
  navName?: string;
  thumb?: string;
  matchedField: "sceneName";
}

export interface SearchScenesOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: SceneSearchMatch[];
  hiddenCount: number;
}

export interface GetSceneInput { sceneId: string; mode?: VisibilityMode }
export interface GetActiveSceneInput { sourceId?: string }

export interface SceneToken {
  id: string;
  name: string;
  actorId?: string;
  actorUuid?: string;
}

export interface SceneNote {
  id: string;
  label?: string;
  journalId?: string;
  journalUuid?: string;
  journalName?: string;
  pageId?: string;
  pageUuid?: string;
  pageName?: string;
}

export interface SceneDocument {
  sourceId: string;
  sourceName: string;
  id: string;
  uuid: string;
  name: string;
  active: boolean;
  navigation: boolean;
  navName?: string;
  thumb?: string;
  background?: { src: string };
  width?: number;
  height?: number;
  folder?: { id: string; name: string };
  linkedJournal?: {
    id: string;
    uuid: string;
    name: string;
    pageId?: string;
    pageUuid?: string;
    pageName?: string;
  };
  tokens?: SceneToken[];
  notes?: SceneNote[];
}

export type GetSceneOutput = SceneDocument;
export type GetActiveSceneOutput = SceneDocument;

export const SEARCH_SCENES_DECLARATION: CapabilityDeclaration = { name: SEARCH_SCENES_CAPABILITY, mode: "read", version: "0.1" };
export const GET_SCENE_DECLARATION: CapabilityDeclaration = { name: GET_SCENE_CAPABILITY, mode: "read", version: "0.1" };
export const GET_ACTIVE_SCENE_DECLARATION: CapabilityDeclaration = { name: GET_ACTIVE_SCENE_CAPABILITY, mode: "read", version: "0.1" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const VISIBILITY_MODES: VisibilityMode[] = ["gm", "player"];

export function validateSearchScenesInput(value: unknown): ValidationResult<SearchScenesInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)) {
    errors.push("limit must be an integer between 1 and 50");
  }
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) errors.push("mode must be 'gm' or 'player'");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchScenesInput, errors: [] };
}

export function validateSearchScenesOutput(value: unknown): ValidationResult<SearchScenesOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.query)) errors.push("query is required");
  if (!Array.isArray(value.results)) errors.push("results must be an array");
  else value.results.forEach((result, index) => {
    if (!isRecord(result)) return errors.push(`results[${index}] must be an object`);
    if (!isNonEmptyString(result.sceneId)) errors.push(`results[${index}].sceneId is required`);
    if (!isNonEmptyString(result.sceneUuid)) errors.push(`results[${index}].sceneUuid is required`);
    if (!isNonEmptyString(result.sceneName)) errors.push(`results[${index}].sceneName is required`);
    if (typeof result.active !== "boolean") errors.push(`results[${index}].active must be a boolean`);
    if (typeof result.navigation !== "boolean") errors.push(`results[${index}].navigation must be a boolean`);
    if (result.matchedField !== "sceneName") errors.push(`results[${index}].matchedField is invalid`);
  });
  if (typeof value.hiddenCount !== "number" || !Number.isInteger(value.hiddenCount) || (value.hiddenCount as number) < 0) errors.push("hiddenCount must be a non-negative integer");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchScenesOutput, errors: [] };
}

export function validateGetSceneInput(value: unknown): ValidationResult<GetSceneInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.sceneId)) errors.push("sceneId must be a non-empty string");
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) errors.push("mode must be 'gm' or 'player'");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetSceneInput, errors: [] };
}

export function validateGetActiveSceneInput(value: unknown): ValidationResult<GetActiveSceneInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (value.sourceId !== undefined && !isNonEmptyString(value.sourceId)) {
    return { valid: false, errors: ["sourceId must be a non-empty string if provided"] };
  }
  return { valid: true, value: value as unknown as GetActiveSceneInput, errors: [] };
}

export function validateGetActiveSceneOutput(value: unknown): ValidationResult<GetActiveSceneOutput> {
  return validateGetSceneOutput(value) as ValidationResult<GetActiveSceneOutput>;
}

function validateSceneToken(token: unknown, index: number, errors: string[]): void {
  if (!isRecord(token)) { errors.push(`tokens[${index}] must be an object`); return; }
  if (!isNonEmptyString(token.id)) errors.push(`tokens[${index}].id is required`);
  if (!isNonEmptyString(token.name)) errors.push(`tokens[${index}].name is required`);
  if (token.actorId !== undefined && typeof token.actorId !== "string") errors.push(`tokens[${index}].actorId must be a string`);
  if (token.actorUuid !== undefined && typeof token.actorUuid !== "string") errors.push(`tokens[${index}].actorUuid must be a string`);
}

function validateSceneNote(note: unknown, index: number, errors: string[]): void {
  if (!isRecord(note)) { errors.push(`notes[${index}] must be an object`); return; }
  if (!isNonEmptyString(note.id)) errors.push(`notes[${index}].id is required`);
  for (const key of ["label", "journalId", "journalUuid", "journalName", "pageId", "pageUuid", "pageName"] as const) {
    if (note[key] !== undefined && typeof note[key] !== "string") errors.push(`notes[${index}].${key} must be a string`);
  }
}

export function validateGetSceneOutput(value: unknown): ValidationResult<GetSceneOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  for (const key of ["sourceId", "sourceName", "id", "uuid", "name"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`${key} is required`);
  }
  if (typeof value.active !== "boolean") errors.push("active must be a boolean");
  if (typeof value.navigation !== "boolean") errors.push("navigation must be a boolean");
  if (value.navName !== undefined && typeof value.navName !== "string") errors.push("navName must be a string");
  if (value.thumb !== undefined && typeof value.thumb !== "string") errors.push("thumb must be a string");
  if (value.background !== undefined) {
    if (!isRecord(value.background) || !isNonEmptyString(value.background.src)) errors.push("background.src must be a non-empty string");
  }
  if (value.width !== undefined && typeof value.width !== "number") errors.push("width must be a number");
  if (value.height !== undefined && typeof value.height !== "number") errors.push("height must be a number");
  if (value.folder !== undefined) {
    if (!isRecord(value.folder)) errors.push("folder must be an object");
    else {
      if (!isNonEmptyString(value.folder.id)) errors.push("folder.id is required");
      if (!isNonEmptyString(value.folder.name)) errors.push("folder.name is required");
    }
  }
  if (value.linkedJournal !== undefined) {
    if (!isRecord(value.linkedJournal)) errors.push("linkedJournal must be an object");
    else {
      for (const key of ["id", "uuid", "name"] as const) {
        if (!isNonEmptyString(value.linkedJournal[key])) errors.push(`linkedJournal.${key} is required`);
      }
    }
  }
  if (value.tokens !== undefined) {
    if (!Array.isArray(value.tokens)) errors.push("tokens must be an array");
    else value.tokens.forEach((token, i) => validateSceneToken(token, i, errors));
  }
  if (value.notes !== undefined) {
    if (!Array.isArray(value.notes)) errors.push("notes must be an array");
    else value.notes.forEach((note, i) => validateSceneNote(note, i, errors));
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetSceneOutput, errors };
}
