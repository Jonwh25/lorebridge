import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";

export const LIST_PLAYLISTS_CAPABILITY = "listPlaylists" as const;
export const SEARCH_PLAYLISTS_CAPABILITY = "searchPlaylists" as const;

export interface ListPlaylistsInput { mode?: VisibilityMode }
export interface SearchPlaylistsInput {
  query: string;
  limit?: number;
  mode?: VisibilityMode;
  folderId?: string;
}

export interface PlaylistSummary {
  playlistId: string;
  playlistName: string;
  folderId?: string;
  folderName?: string;
  playing: boolean;
  trackCount: number;
}

export interface ListPlaylistsOutput {
  sourceId: string;
  sourceName: string;
  playlists: PlaylistSummary[];
  hiddenCount: number;
}

export interface SearchPlaylistsOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: PlaylistSummary[];
  hiddenCount: number;
}

export const LIST_PLAYLISTS_DECLARATION: CapabilityDeclaration = { name: LIST_PLAYLISTS_CAPABILITY, mode: "read", version: "0.1" };
export const SEARCH_PLAYLISTS_DECLARATION: CapabilityDeclaration = { name: SEARCH_PLAYLISTS_CAPABILITY, mode: "read", version: "0.1" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const VISIBILITY_MODES: VisibilityMode[] = ["gm", "player"];

function validateMode(value: unknown, errors: string[]): void {
  if (value !== undefined && !VISIBILITY_MODES.includes(value as VisibilityMode)) errors.push("mode must be 'gm' or 'player'");
}

export function validateListPlaylistsInput(value: unknown): ValidationResult<ListPlaylistsInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  const errors: string[] = [];
  validateMode(value.mode, errors);
  return errors.length ? { valid: false, errors } : { valid: true, value: value as ListPlaylistsInput, errors: [] };
}

export function validateSearchPlaylistsInput(value: unknown): ValidationResult<SearchPlaylistsInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(value.query)) errors.push("query must be a non-empty string");
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)) errors.push("limit must be an integer between 1 and 50");
  validateMode(value.mode, errors);
  if (value.folderId !== undefined && !isNonEmptyString(value.folderId)) errors.push("folderId must be a non-empty string");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as SearchPlaylistsInput, errors: [] };
}

function validatePlaylist(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return; }
  if (!isNonEmptyString(value.playlistId)) errors.push(`${path}.playlistId is required`);
  if (!isNonEmptyString(value.playlistName)) errors.push(`${path}.playlistName is required`);
  if (value.folderId !== undefined && typeof value.folderId !== "string") errors.push(`${path}.folderId must be a string`);
  if (value.folderName !== undefined && typeof value.folderName !== "string") errors.push(`${path}.folderName must be a string`);
  if (typeof value.playing !== "boolean") errors.push(`${path}.playing must be a boolean`);
  if (!Number.isInteger(value.trackCount) || (value.trackCount as number) < 0) errors.push(`${path}.trackCount must be a non-negative integer`);
}

function validateBaseOutput(value: unknown, collectionKey: "playlists" | "results", requireQuery: boolean): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["output must be an object"];
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (requireQuery && !isNonEmptyString(value.query)) errors.push("query is required");
  const collection = value[collectionKey];
  if (!Array.isArray(collection)) errors.push(`${collectionKey} must be an array`);
  else collection.forEach((playlist, index) => validatePlaylist(playlist, `${collectionKey}[${index}]`, errors));
  if (!Number.isInteger(value.hiddenCount) || (value.hiddenCount as number) < 0) errors.push("hiddenCount must be a non-negative integer");
  return errors;
}

export function validateListPlaylistsOutput(value: unknown): ValidationResult<ListPlaylistsOutput> {
  const errors = validateBaseOutput(value, "playlists", false);
  return errors.length ? { valid: false, errors } : { valid: true, value: value as ListPlaylistsOutput, errors: [] };
}

export function validateSearchPlaylistsOutput(value: unknown): ValidationResult<SearchPlaylistsOutput> {
  const errors = validateBaseOutput(value, "results", true);
  return errors.length ? { valid: false, errors } : { valid: true, value: value as SearchPlaylistsOutput, errors: [] };
}
