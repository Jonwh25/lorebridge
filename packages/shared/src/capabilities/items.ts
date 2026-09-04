import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";

export const SEARCH_ITEMS_CAPABILITY = "searchItems" as const;
export const GET_ITEM_CAPABILITY = "getItem" as const;
export const GET_ACTOR_INVENTORY_CAPABILITY = "getActorInventory" as const;

export interface SearchItemsInput {
  query: string;
  limit?: number;
  types?: string[];
  mode?: VisibilityMode;
  folderId?: string;
  excludeFolderIds?: string[];
}

export interface ItemSearchMatch {
  itemId: string;
  itemUuid: string;
  itemName: string;
  itemType: string;
  img?: string;
  folderId?: string;
  folderName?: string;
  matchedField: "itemName" | "description";
  excerpt?: string;
}

export interface SearchItemsOutput {
  sourceId: string;
  sourceName: string;
  query: string;
  results: ItemSearchMatch[];
  hiddenCount: number;
}

export interface GetActorInventoryInput {
  actorId: string;
  mode?: VisibilityMode;
}

export interface InventoryItem {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img?: string;
  quantity?: number;
  weight?: number;
  price?: string;
  rarity?: string;
  identified?: boolean;
  description?: string;
}

export interface GetActorInventoryOutput {
  sourceId: string;
  sourceName: string;
  actorId: string;
  actorUuid: string;
  actorName: string;
  items: InventoryItem[];
}

export interface GetItemInput {
  itemId: string;
  mode?: VisibilityMode;
}

export interface GetItemOutput {
  sourceId: string;
  sourceName: string;
  systemId: string;
  id: string;
  uuid: string;
  name: string;
  type: string;
  img?: string;
  folder?: { id: string; name: string };
  description?: string;
  quantity?: number;
  weight?: number;
  price?: string;
  rarity?: string;
  identified?: boolean;
  activation?: { type?: string; cost?: number; condition?: string };
  target?: { value?: number; units?: string; type?: string };
  range?: { value?: number; long?: number; units?: string };
  duration?: { value?: number; units?: string };
  uses?: { value?: number; max?: number; per?: string };
  damageFormulas?: string[];
  save?: { ability?: string; dc?: number };
  properties?: string[];
}

export const SEARCH_ITEMS_DECLARATION: CapabilityDeclaration = {
  name: SEARCH_ITEMS_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const GET_ITEM_DECLARATION: CapabilityDeclaration = {
  name: GET_ITEM_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const GET_ACTOR_INVENTORY_DECLARATION: CapabilityDeclaration = {
  name: GET_ACTOR_INVENTORY_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const VISIBILITY_MODES: VisibilityMode[] = ["gm", "player"];

export function validateSearchItemsInput(
  value: unknown,
): ValidationResult<SearchItemsInput> {
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
      || value.types.some((t) => !isNonEmptyString(t))
    ) {
      errors.push("types must contain between 1 and 20 non-empty strings");
    }
  }
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) {
    errors.push("mode must be 'gm' or 'player'");
  }
  if (value.folderId !== undefined && !isNonEmptyString(value.folderId)) {
    errors.push("folderId must be a non-empty string");
  }
  if (value.excludeFolderIds !== undefined) {
    if (!Array.isArray(value.excludeFolderIds) || value.excludeFolderIds.some((id) => !isNonEmptyString(id))) errors.push("excludeFolderIds must be an array of non-empty strings");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as SearchItemsInput, errors: [] };
}

export function validateSearchItemsOutput(
  value: unknown,
): ValidationResult<SearchItemsOutput> {
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
      for (const key of ["itemId", "itemUuid", "itemName", "itemType"] as const) {
        if (!isNonEmptyString(result[key])) errors.push(`results[${index}].${key} is required`);
      }
      if (!["itemName", "description"].includes(String(result.matchedField))) {
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
      if (result.excerpt !== undefined && typeof result.excerpt !== "string") {
        errors.push(`results[${index}].excerpt must be a string`);
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
    : { valid: true, value: value as unknown as SearchItemsOutput, errors: [] };
}

export function validateGetActorInventoryInput(
  value: unknown,
): ValidationResult<GetActorInventoryInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.actorId)) errors.push("actorId must be a non-empty string");
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) {
    errors.push("mode must be 'gm' or 'player'");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetActorInventoryInput, errors: [] };
}

function validateInventoryItem(item: unknown, index: number, errors: string[]): void {
  if (!isRecord(item)) { errors.push(`items[${index}] must be an object`); return; }
  for (const key of ["id", "uuid", "name", "type"] as const) {
    if (!isNonEmptyString(item[key])) errors.push(`items[${index}].${key} is required`);
  }
  if (item.img !== undefined && typeof item.img !== "string") {
    errors.push(`items[${index}].img must be a string`);
  }
  if (item.quantity !== undefined && (typeof item.quantity !== "number" || !Number.isFinite(item.quantity))) {
    errors.push(`items[${index}].quantity must be a number`);
  }
  if (item.weight !== undefined && (typeof item.weight !== "number" || !Number.isFinite(item.weight))) {
    errors.push(`items[${index}].weight must be a number`);
  }
  if (item.price !== undefined && typeof item.price !== "string") {
    errors.push(`items[${index}].price must be a string`);
  }
  if (item.rarity !== undefined && typeof item.rarity !== "string") {
    errors.push(`items[${index}].rarity must be a string`);
  }
  if (item.identified !== undefined && typeof item.identified !== "boolean") {
    errors.push(`items[${index}].identified must be a boolean`);
  }
  if (item.description !== undefined && typeof item.description !== "string") {
    errors.push(`items[${index}].description must be a string`);
  }
}

export function validateGetActorInventoryOutput(
  value: unknown,
): ValidationResult<GetActorInventoryOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  for (const key of ["sourceId", "sourceName", "actorId", "actorUuid", "actorName"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`${key} is required`);
  }
  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    value.items.forEach((item, index) => validateInventoryItem(item, index, errors));
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as GetActorInventoryOutput, errors: [] };
}

export function validateGetItemInput(value: unknown): ValidationResult<GetItemInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.itemId)) errors.push("itemId must be a non-empty string");
  if (value.mode !== undefined && !VISIBILITY_MODES.includes(value.mode as VisibilityMode)) {
    errors.push("mode must be 'gm' or 'player'");
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetItemInput, errors: [] };
}

export function validateGetItemOutput(value: unknown): ValidationResult<GetItemOutput> {
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
  if (value.description !== undefined && typeof value.description !== "string") errors.push("description must be a string");
  if (value.quantity !== undefined && (typeof value.quantity !== "number" || !Number.isFinite(value.quantity))) errors.push("quantity must be a number");
  if (value.weight !== undefined && (typeof value.weight !== "number" || !Number.isFinite(value.weight))) errors.push("weight must be a number");
  if (value.price !== undefined && typeof value.price !== "string") errors.push("price must be a string");
  if (value.rarity !== undefined && typeof value.rarity !== "string") errors.push("rarity must be a string");
  if (value.identified !== undefined && typeof value.identified !== "boolean") errors.push("identified must be a boolean");
  if (value.activation !== undefined && !isRecord(value.activation)) errors.push("activation must be an object");
  if (value.target !== undefined && !isRecord(value.target)) errors.push("target must be an object");
  if (value.range !== undefined && !isRecord(value.range)) errors.push("range must be an object");
  if (value.duration !== undefined && !isRecord(value.duration)) errors.push("duration must be an object");
  if (value.uses !== undefined && !isRecord(value.uses)) errors.push("uses must be an object");
  if (value.damageFormulas !== undefined && (!Array.isArray(value.damageFormulas) || value.damageFormulas.some((f) => typeof f !== "string"))) errors.push("damageFormulas must be an array of strings");
  if (value.save !== undefined && !isRecord(value.save)) errors.push("save must be an object");
  if (value.properties !== undefined && (!Array.isArray(value.properties) || value.properties.some((p) => typeof p !== "string"))) errors.push("properties must be an array of strings");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetItemOutput, errors: [] };
}
