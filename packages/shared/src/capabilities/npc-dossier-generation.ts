import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const GET_NPC_DOSSIER_CONTEXT_CAPABILITY = "getNpcDossierContext" as const;
export const GET_NPC_DOSSIER_CONTEXT_DECLARATION: CapabilityDeclaration = {
  name: GET_NPC_DOSSIER_CONTEXT_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const GET_FACTION_CONTEXT_CAPABILITY = "getFactionContext" as const;
export const GET_FACTION_CONTEXT_DECLARATION: CapabilityDeclaration = {
  name: GET_FACTION_CONTEXT_CAPABILITY,
  mode: "read",
  version: "0.1",
};

// ---------------------------------------------------------------------------
// NPC Dossier context (read)
// ---------------------------------------------------------------------------

export interface GetNpcDossierContextInput {
  journalId: string;
}

export interface NpcDossierContextData {
  journalId: string;
  journalName: string;
  ccRace?: string;
  ccClass?: string;
  ccOccupation?: string;
  linkedActorId?: string;
  linkedActorName?: string;
  npcProfile?: Record<string, Record<string, string>>;
  currentDossier?: Record<string, unknown>;
}

export interface GetNpcDossierContextOutput {
  sourceId: string;
  sourceName: string;
  context: NpcDossierContextData;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validateGetNpcDossierContextOutput(
  raw: unknown,
): ValidationResult<GetNpcDossierContextOutput> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ["Expected an object"] };
  if (typeof raw["sourceId"] !== "string" || !raw["sourceId"])
    errors.push("sourceId must be a non-empty string");
  if (typeof raw["sourceName"] !== "string")
    errors.push("sourceName must be a string");
  if (!isRecord(raw["context"])) errors.push("context must be an object");
  else {
    const ctx = raw["context"];
    if (typeof ctx["journalId"] !== "string" || !ctx["journalId"])
      errors.push("context.journalId must be a non-empty string");
    if (typeof ctx["journalName"] !== "string")
      errors.push("context.journalName must be a string");
  }
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: raw as unknown as GetNpcDossierContextOutput, errors: [] };
}

// ---------------------------------------------------------------------------
// Faction context (read)
// ---------------------------------------------------------------------------

export interface GetFactionContextInput {
  journalId: string;
}

export interface FactionContextData {
  journalId: string;
  journalName: string;
  pageId?: string;
  pageContent?: string;
  currentFactionProfile?: Record<string, unknown>;
}

export interface GetFactionContextOutput {
  sourceId: string;
  sourceName: string;
  context: FactionContextData;
}

export function validateGetFactionContextOutput(
  raw: unknown,
): ValidationResult<GetFactionContextOutput> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ["Expected an object"] };
  if (typeof raw["sourceId"] !== "string" || !raw["sourceId"])
    errors.push("sourceId must be a non-empty string");
  if (typeof raw["sourceName"] !== "string")
    errors.push("sourceName must be a string");
  if (!isRecord(raw["context"])) errors.push("context must be an object");
  else {
    const ctx = raw["context"];
    if (typeof ctx["journalId"] !== "string" || !ctx["journalId"])
      errors.push("context.journalId must be a non-empty string");
    if (typeof ctx["journalName"] !== "string")
      errors.push("context.journalName must be a string");
  }
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: raw as unknown as GetFactionContextOutput, errors: [] };
}

// ---------------------------------------------------------------------------
// Approve result types (returned by backend on approve)
// ---------------------------------------------------------------------------

export type ApproveNpcDossierResult = {
  journalId: string;
  journalName: string;
  tab: "roleplay" | "overview" | "knowledge";
  proposedFields: Record<string, unknown>;
};

export type ApproveFactionProfileResult = {
  journalId: string;
  journalName: string;
  pageId?: string;
  proposedPageContent?: string;
  proposedFactionProfile: Record<string, unknown>;
};

export function validateApproveNpcDossierResult(
  raw: unknown,
): ValidationResult<ApproveNpcDossierResult> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ["Expected an object"] };
  if (typeof raw["journalId"] !== "string" || !raw["journalId"])
    errors.push("journalId must be a non-empty string");
  if (typeof raw["journalName"] !== "string")
    errors.push("journalName must be a string");
  if (!["roleplay", "overview", "knowledge"].includes(raw["tab"] as string))
    errors.push("tab must be roleplay, overview, or knowledge");
  if (!isRecord(raw["proposedFields"]))
    errors.push("proposedFields must be an object");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: raw as unknown as ApproveNpcDossierResult, errors: [] };
}

export function validateApproveFactionProfileResult(
  raw: unknown,
): ValidationResult<ApproveFactionProfileResult> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ["Expected an object"] };
  if (typeof raw["journalId"] !== "string" || !raw["journalId"])
    errors.push("journalId must be a non-empty string");
  if (typeof raw["journalName"] !== "string")
    errors.push("journalName must be a string");
  if (!isRecord(raw["proposedFactionProfile"]))
    errors.push("proposedFactionProfile must be an object");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: raw as unknown as ApproveFactionProfileResult, errors: [] };
}
