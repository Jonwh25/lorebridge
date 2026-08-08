import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const EXECUTE_COMBAT_WRITE_CAPABILITY = "executeCombatWrite" as const;
export const COMBAT_WRITE_TTL_MS = 60_000;
export const COMBAT_WRITE_TEST_ACTION = "test" as const;
export const COMBAT_WRITE_NEXT_TURN_ACTION = "nextTurn" as const;
export const PROPOSE_COMBAT_WRITE_CAPABILITY = "proposeCombatWrite" as const;
export type CombatWriteAction = typeof COMBAT_WRITE_TEST_ACTION | typeof COMBAT_WRITE_NEXT_TURN_ACTION;

export interface CombatWriteCombatantSnapshot { id: string; name: string; initiative: number | null }
export interface CombatWriteSnapshot {
  combatUuid: string; combatName: string; sceneId?: string; round: number; turn: number;
  currentCombatantId?: string; combatants: CombatWriteCombatantSnapshot[]; fingerprint: string;
}
export interface CombatWriteProposal {
  action: CombatWriteAction; combatUuid: string; expectedRound: number; expectedTurn: number;
  target: { combatUuid: string }; parameters: Record<string, unknown>; rationale: string;
  beforeSummary: string; afterSummary: string; snapshot: CombatWriteSnapshot;
}
export interface ProposeCombatWriteInput { action: typeof COMBAT_WRITE_NEXT_TURN_ACTION; rationale: string }
export interface CombatWriteApprovalPayload extends CombatWriteProposal { token: string; expiresAt: string }
export interface ExecuteCombatWriteInput { proposal: CombatWriteProposal }
export type CombatWriteAuditOutcome = "approved" | "rejected" | "stale";
export interface CombatWriteAuditResult {
  action: CombatWriteAction; target: { combatUuid: string }; outcome: CombatWriteAuditOutcome;
  occurredAt: string; summary: string; stateFingerprint?: string;
  resultingRound?: number; resultingTurn?: number; resultingCombatantId?: string;
}
export interface CombatWriteProposalResult extends CombatWriteApprovalPayload { instruction: string }

export const EXECUTE_COMBAT_WRITE_DECLARATION: CapabilityDeclaration = {
  name: EXECUTE_COMBAT_WRITE_CAPABILITY, mode: "write", version: "0.1", requiresApproval: true,
};
export const PROPOSE_COMBAT_WRITE_DECLARATION: CapabilityDeclaration = {
  name: PROPOSE_COMBAT_WRITE_CAPABILITY, mode: "write", version: "0.1", requiresApproval: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

function validateSnapshot(value: unknown, errors: string[]): value is CombatWriteSnapshot {
  if (!isRecord(value)) { errors.push("snapshot must be an object"); return false; }
  if (!isString(value.combatUuid)) errors.push("snapshot.combatUuid is required");
  if (!isString(value.combatName)) errors.push("snapshot.combatName is required");
  if (value.sceneId !== undefined && !isString(value.sceneId)) errors.push("snapshot.sceneId must be a non-empty string");
  if (!isInteger(value.round)) errors.push("snapshot.round must be a non-negative integer");
  if (!isInteger(value.turn)) errors.push("snapshot.turn must be a non-negative integer");
  if (value.currentCombatantId !== undefined && !isString(value.currentCombatantId)) errors.push("snapshot.currentCombatantId must be a non-empty string");
  if (!isString(value.fingerprint)) errors.push("snapshot.fingerprint is required");
  if (!Array.isArray(value.combatants) || value.combatants.length > 200) errors.push("snapshot.combatants must be an array with at most 200 entries");
  else value.combatants.forEach((combatant, index) => {
    if (!isRecord(combatant) || !isString(combatant.id)) errors.push(`snapshot.combatants[${index}].id is required`);
    if (!isRecord(combatant) || !isString(combatant.name) || combatant.name.length > 200) errors.push(`snapshot.combatants[${index}].name must be a non-empty string of at most 200 characters`);
    if (isRecord(combatant) && combatant.initiative !== null && (typeof combatant.initiative !== "number" || !Number.isFinite(combatant.initiative))) errors.push(`snapshot.combatants[${index}].initiative must be finite or null`);
  });
  return errors.length === 0;
}

export function validateCombatWriteProposal(value: unknown): ValidationResult<CombatWriteProposal> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["proposal must be an object"] };
  if (value.action !== COMBAT_WRITE_TEST_ACTION && value.action !== COMBAT_WRITE_NEXT_TURN_ACTION) errors.push("action must be test or nextTurn");
  if (!isString(value.combatUuid)) errors.push("combatUuid is required");
  if (!isInteger(value.expectedRound)) errors.push("expectedRound must be a non-negative integer");
  if (!isInteger(value.expectedTurn)) errors.push("expectedTurn must be a non-negative integer");
  if (!isRecord(value.target) || !isString(value.target.combatUuid)) errors.push("target.combatUuid is required");
  if (!isRecord(value.parameters)) errors.push("parameters must be an object");
  else if (value.action === COMBAT_WRITE_TEST_ACTION && Object.keys(value.parameters).length !== 0) errors.push("parameters must be an empty object for the test action");
  else if (value.action === COMBAT_WRITE_NEXT_TURN_ACTION && (Object.keys(value.parameters).length !== 1 || !isString(value.parameters.expectedNextCombatantId))) errors.push("parameters.expectedNextCombatantId is required for nextTurn and must be the only parameter");
  for (const field of ["rationale", "beforeSummary", "afterSummary"] as const) if (!isString(value[field]) || (value[field] as string).length > 500) errors.push(`${field} must be a non-empty string of at most 500 characters`);
  validateSnapshot(value.snapshot, errors);
  if (isRecord(value.snapshot)) {
    if (value.combatUuid !== value.snapshot.combatUuid) errors.push("combatUuid must match snapshot.combatUuid");
    if (value.expectedRound !== value.snapshot.round) errors.push("expectedRound must match snapshot.round");
    if (value.expectedTurn !== value.snapshot.turn) errors.push("expectedTurn must match snapshot.turn");
    if (value.action === COMBAT_WRITE_NEXT_TURN_ACTION && Array.isArray(value.snapshot.combatants) && isRecord(value.parameters) && value.snapshot.combatants.length > 0 && isInteger(value.snapshot.turn)) {
      const expected = value.snapshot.combatants[((value.snapshot.turn as number) + 1) % value.snapshot.combatants.length];
      if (!isRecord(expected) || value.parameters.expectedNextCombatantId !== expected.id) errors.push("parameters.expectedNextCombatantId must identify the next combatant in snapshot order");
    }
  }
  if (isRecord(value.target) && value.target.combatUuid !== value.combatUuid) errors.push("target.combatUuid must match combatUuid");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as CombatWriteProposal, errors: [] };
}

export function validateProposeCombatWriteInput(value: unknown): ValidationResult<ProposeCombatWriteInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (value.action !== COMBAT_WRITE_NEXT_TURN_ACTION) errors.push("action must be nextTurn");
  if (!isString(value.rationale) || (value.rationale as string).length > 500) errors.push("rationale must be a non-empty string of at most 500 characters");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as ProposeCombatWriteInput, errors: [] };
}

export function validateCombatWriteProposalResult(value: unknown): ValidationResult<CombatWriteProposalResult> {
  const proposal = validateCombatWriteProposal(value);
  if (!proposal.valid || !isRecord(value)) return { valid: false, errors: proposal.errors };
  const errors: string[] = [];
  if (!isString(value.token)) errors.push("token is required");
  if (!isString(value.expiresAt) || Number.isNaN(Date.parse(value.expiresAt as string))) errors.push("expiresAt must be an ISO date-time");
  if (!isString(value.instruction) || (value.instruction as string).length > 500) errors.push("instruction must be a non-empty string of at most 500 characters");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as CombatWriteProposalResult, errors: [] };
}

export function validateExecuteCombatWriteInput(value: unknown): ValidationResult<ExecuteCombatWriteInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  const proposal = validateCombatWriteProposal(value.proposal);
  return proposal.valid ? { valid: true, value: value as unknown as ExecuteCombatWriteInput, errors: [] } : { valid: false, errors: proposal.errors.map((error) => `proposal.${error}`) };
}

export function validateCombatWriteAuditResult(value: unknown): ValidationResult<CombatWriteAuditResult> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["audit result must be an object"] };
  if (value.action !== COMBAT_WRITE_TEST_ACTION && value.action !== COMBAT_WRITE_NEXT_TURN_ACTION) errors.push("action must be test or nextTurn");
  if (!isRecord(value.target) || !isString(value.target.combatUuid)) errors.push("target.combatUuid is required");
  if (value.outcome !== "approved" && value.outcome !== "rejected" && value.outcome !== "stale") errors.push("outcome is invalid");
  if (!isString(value.occurredAt) || Number.isNaN(Date.parse(value.occurredAt as string))) errors.push("occurredAt must be an ISO date-time");
  if (!isString(value.summary) || (value.summary as string).length > 500) errors.push("summary must be a non-empty string of at most 500 characters");
  if (value.stateFingerprint !== undefined && !isString(value.stateFingerprint)) errors.push("stateFingerprint must be a non-empty string");
  for (const field of ["resultingRound", "resultingTurn"] as const) if (value[field] !== undefined && !isInteger(value[field])) errors.push(`${field} must be a non-negative integer`);
  if (value.resultingCombatantId !== undefined && !isString(value.resultingCombatantId)) errors.push("resultingCombatantId must be a non-empty string");
  if (value.action === COMBAT_WRITE_NEXT_TURN_ACTION && value.outcome === "approved" && (!isInteger(value.resultingRound) || !isInteger(value.resultingTurn) || !isString(value.resultingCombatantId))) errors.push("approved nextTurn results must include the resulting round, turn, and combatant ID");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as CombatWriteAuditResult, errors: [] };
}
