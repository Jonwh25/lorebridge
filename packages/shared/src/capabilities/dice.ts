import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const ROLL_DICE_CAPABILITY = "rollDice" as const;
export const MAX_DICE_FORMULA_LENGTH = 200;
export const MAX_DICE_RESULTS = 500;

export interface RollDiceInput {
  formula: string;
  postToChat?: boolean;
}

export interface RolledDieResult {
  value: number;
  active: boolean;
}

export interface RollDiceOutput {
  sourceId: string;
  sourceName: string;
  formula: string;
  total: number;
  breakdown: string;
  rolls: Array<{ faces: number; results: RolledDieResult[] }>;
  postedToChat: boolean;
  chatMessageId?: string;
}

export const ROLL_DICE_DECLARATION: CapabilityDeclaration = {
  name: ROLL_DICE_CAPABILITY,
  mode: "write",
  version: "0.1",
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function validateRollDiceInput(value: unknown): ValidationResult<RollDiceInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.formula)) return { valid: false, errors: ["formula is required"] };
  if (value.formula.length > MAX_DICE_FORMULA_LENGTH) return { valid: false, errors: [`formula must be at most ${MAX_DICE_FORMULA_LENGTH} characters`] };
  if (value.postToChat !== undefined && typeof value.postToChat !== "boolean") return { valid: false, errors: ["postToChat must be a boolean"] };
  return { valid: true, value: { formula: value.formula.trim(), ...(value.postToChat === undefined ? {} : { postToChat: value.postToChat }) }, errors: [] };
}

export function validateRollDiceOutput(value: unknown): ValidationResult<RollDiceOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!isNonEmptyString(value.formula)) errors.push("formula is required");
  if (typeof value.total !== "number" || !Number.isFinite(value.total)) errors.push("total must be a finite number");
  if (!isNonEmptyString(value.breakdown)) errors.push("breakdown is required");
  if (!Array.isArray(value.rolls)) errors.push("rolls must be an array");
  else {
    let diceCount = 0;
    value.rolls.forEach((roll, index) => {
      if (!isRecord(roll) || !Number.isInteger(roll.faces) || (roll.faces as number) < 2) errors.push(`rolls[${index}] must have at least two faces`);
      if (!isRecord(roll) || !Array.isArray(roll.results)) errors.push(`rolls[${index}].results must be an array`);
      else {
        diceCount += roll.results.length;
        roll.results.forEach((result, resultIndex) => {
          if (!isRecord(result) || !Number.isFinite(result.value) || typeof result.active !== "boolean") errors.push(`rolls[${index}].results[${resultIndex}] is invalid`);
        });
      }
    });
    if (diceCount > MAX_DICE_RESULTS) errors.push(`rolls must contain at most ${MAX_DICE_RESULTS} dice results`);
  }
  if (typeof value.postedToChat !== "boolean") errors.push("postedToChat must be a boolean");
  if (value.chatMessageId !== undefined && !isNonEmptyString(value.chatMessageId)) errors.push("chatMessageId must be a string");
  if (value.postedToChat && !isNonEmptyString(value.chatMessageId)) errors.push("chatMessageId is required when postedToChat is true");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as RollDiceOutput, errors: [] };
}
