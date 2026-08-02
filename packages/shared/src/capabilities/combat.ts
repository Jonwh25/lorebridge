import type { CapabilityDeclaration, ValidationResult } from "../index.js";
import type { VisibilityMode } from "./visibility.js";

export const GET_COMBAT_STATE_CAPABILITY = "getCombatState" as const;

export interface GetCombatStateInput { mode?: VisibilityMode }

export interface CombatantState {
  id: string;
  name: string;
  initiative?: number;
  actorId?: string;
  actorUuid?: string;
  actorType?: string;
  tokenId?: string;
  defeated: boolean;
  hitPoints?: { current: number; maximum?: number; temporary?: number };
}

export interface GetCombatStateOutput {
  sourceId: string;
  sourceName: string;
  active: boolean;
  started: boolean;
  round?: number;
  turn?: number;
  currentCombatantId?: string;
  combatants: CombatantState[];
  hiddenCount: number;
}

export const GET_COMBAT_STATE_DECLARATION: CapabilityDeclaration = {
  name: GET_COMBAT_STATE_CAPABILITY,
  mode: "read",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function validateGetCombatStateInput(value: unknown): ValidationResult<GetCombatStateInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (value.mode !== undefined && value.mode !== "gm" && value.mode !== "player") {
    return { valid: false, errors: ["mode must be 'gm' or 'player'"] };
  }
  return { valid: true, value: value as GetCombatStateInput, errors: [] };
}

export function validateGetCombatStateOutput(value: unknown): ValidationResult<GetCombatStateOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (typeof value.active !== "boolean") errors.push("active must be a boolean");
  if (typeof value.started !== "boolean") errors.push("started must be a boolean");
  if (value.round !== undefined && (!Number.isInteger(value.round) || (value.round as number) < 0)) errors.push("round must be a non-negative integer");
  if (value.turn !== undefined && (!Number.isInteger(value.turn) || (value.turn as number) < 0)) errors.push("turn must be a non-negative integer");
  if (value.currentCombatantId !== undefined && !isNonEmptyString(value.currentCombatantId)) errors.push("currentCombatantId must be a string");
  if (!Array.isArray(value.combatants)) errors.push("combatants must be an array");
  else value.combatants.forEach((combatant, index) => {
    if (!isRecord(combatant)) return errors.push(`combatants[${index}] must be an object`);
    if (!isNonEmptyString(combatant.id)) errors.push(`combatants[${index}].id is required`);
    if (!isNonEmptyString(combatant.name)) errors.push(`combatants[${index}].name is required`);
    if (combatant.initiative !== undefined && typeof combatant.initiative !== "number") errors.push(`combatants[${index}].initiative must be a number`);
    if (typeof combatant.defeated !== "boolean") errors.push(`combatants[${index}].defeated must be a boolean`);
    if (combatant.hitPoints !== undefined) {
      if (!isRecord(combatant.hitPoints) || typeof combatant.hitPoints.current !== "number") errors.push(`combatants[${index}].hitPoints.current must be a number`);
    }
  });
  if (!Number.isInteger(value.hiddenCount) || (value.hiddenCount as number) < 0) errors.push("hiddenCount must be a non-negative integer");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GetCombatStateOutput, errors: [] };
}
