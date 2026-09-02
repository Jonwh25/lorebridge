import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const GET_QUEST_OBJECTIVES_CAPABILITY = "getQuestObjectives" as const;
export const GET_QUEST_OBJECTIVES_DECLARATION: CapabilityDeclaration = {
  name: GET_QUEST_OBJECTIVES_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export type QuestObjective = {
  text?: string;
  completed?: boolean;
  failed?: boolean;
  objectives?: QuestObjective[];
};

export type QuestObjectiveStatus = "active" | "available" | "completed" | "failed";

export interface GetQuestObjectivesInput {
  journalId: string;
}

export interface GetQuestObjectivesOutput {
  sourceId: string;
  sourceName: string;
  journalId: string;
  journalName: string;
  questStatus: QuestObjectiveStatus;
  objectives: QuestObjective[];
}

export type ApproveCcQuestResult = {
  journalId: string;
  journalName: string;
  proposedObjectives: QuestObjective[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isObjectiveArray(v: unknown): v is QuestObjective[] {
  if (!Array.isArray(v)) return false;
  return v.every((item) => isRecord(item));
}

export function validateGetQuestObjectivesOutput(raw: unknown): ValidationResult<GetQuestObjectivesOutput> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ["Expected an object"] };
  if (typeof raw["sourceId"] !== "string" || !raw["sourceId"]) errors.push("sourceId must be a non-empty string");
  if (typeof raw["sourceName"] !== "string") errors.push("sourceName must be a string");
  if (typeof raw["journalId"] !== "string" || !raw["journalId"]) errors.push("journalId must be a non-empty string");
  if (typeof raw["journalName"] !== "string") errors.push("journalName must be a string");
  if (!["active", "available", "completed", "failed"].includes(raw["questStatus"] as string)) errors.push("questStatus must be a valid status");
  if (!isObjectiveArray(raw["objectives"])) errors.push("objectives must be an array");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: raw as unknown as GetQuestObjectivesOutput, errors: [] };
}

export function validateApproveCcQuestResult(raw: unknown): ValidationResult<ApproveCcQuestResult> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ["Expected an object"] };
  if (typeof raw["journalId"] !== "string" || !raw["journalId"]) errors.push("journalId must be a non-empty string");
  if (typeof raw["journalName"] !== "string") errors.push("journalName must be a string");
  if (!isObjectiveArray(raw["proposedObjectives"])) errors.push("proposedObjectives must be an array");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: raw as ApproveCcQuestResult, errors: [] };
}
