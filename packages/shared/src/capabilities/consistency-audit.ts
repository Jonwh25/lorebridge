export const AUDIT_CAMPAIGN_CONSISTENCY_CAPABILITY = "auditCampaignConsistency";

export const AUDIT_CAMPAIGN_CONSISTENCY_DECLARATION = Object.freeze({
  name: AUDIT_CAMPAIGN_CONSISTENCY_CAPABILITY,
  description:
    "Audit campaign documents for contradictory facts, duplicate entities, and timeline conflicts using AI analysis.",
});

export const ALL_CONSISTENCY_FINDING_CATEGORIES = [
  "contradiction",
  "duplicate-entity",
  "timeline-conflict",
] as const;

export type ConsistencyFindingCategory = (typeof ALL_CONSISTENCY_FINDING_CATEGORIES)[number];
export type ConsistencyFindingSeverity = "high" | "medium" | "low";
export type ConsistencyFindingConfidence = "high" | "medium" | "low";

export const CONSISTENCY_AUDIT_DEFAULT_LIMIT = 20;
export const CONSISTENCY_AUDIT_MAX_LIMIT = 50;

export interface ConsistencyFinding {
  category: ConsistencyFindingCategory;
  severity: ConsistencyFindingSeverity;
  confidence: ConsistencyFindingConfidence;
  sourceUuids: string[];
  sourceNames: string[];
  explanation: string;
  evidence: string[];
  suggestion?: string;
}

export interface AuditCampaignConsistencyInput {
  focus?: string;
  limit?: number;
}

export interface AuditCampaignConsistencyOutput {
  sourceId: string;
  sourceName: string;
  findings: ConsistencyFinding[];
  documentsAnalyzed: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

type ValidationResult<T> =
  | { valid: true; value: T; errors: [] }
  | { valid: false; value: null; errors: string[] };

export function validateAuditCampaignConsistencyInput(
  raw: unknown,
): ValidationResult<AuditCampaignConsistencyInput> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, value: null, errors: ["Input must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (obj["focus"] !== undefined) {
    if (typeof obj["focus"] !== "string" || obj["focus"].trim().length === 0) {
      errors.push("focus must be a non-empty string when provided");
    }
    if (typeof obj["focus"] === "string" && obj["focus"].length > 200) {
      errors.push("focus must be at most 200 characters");
    }
  }

  if (obj["limit"] !== undefined) {
    if (
      typeof obj["limit"] !== "number" ||
      !Number.isInteger(obj["limit"]) ||
      obj["limit"] < 1 ||
      obj["limit"] > CONSISTENCY_AUDIT_MAX_LIMIT
    ) {
      errors.push(`limit must be an integer between 1 and ${CONSISTENCY_AUDIT_MAX_LIMIT}`);
    }
  }

  if (errors.length > 0) return { valid: false, value: null, errors };
  const value: AuditCampaignConsistencyInput = {};
  if (typeof obj["focus"] === "string") value.focus = obj["focus"].trim();
  if (typeof obj["limit"] === "number") value.limit = obj["limit"];
  return { valid: true, value, errors: [] };
}

function isConsistencyFinding(x: unknown): x is ConsistencyFinding {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  if (!ALL_CONSISTENCY_FINDING_CATEGORIES.includes(f["category"] as ConsistencyFindingCategory)) return false;
  if (!["high", "medium", "low"].includes(f["severity"] as string)) return false;
  if (!["high", "medium", "low"].includes(f["confidence"] as string)) return false;
  if (!Array.isArray(f["sourceUuids"]) || !f["sourceUuids"].every((u) => typeof u === "string")) return false;
  if (!Array.isArray(f["sourceNames"]) || !f["sourceNames"].every((n) => typeof n === "string")) return false;
  if (typeof f["explanation"] !== "string" || f["explanation"].trim().length === 0) return false;
  if (!Array.isArray(f["evidence"]) || !f["evidence"].every((e) => typeof e === "string")) return false;
  if (f["suggestion"] !== undefined && typeof f["suggestion"] !== "string") return false;
  return true;
}

export function validateAuditCampaignConsistencyOutput(
  raw: unknown,
): ValidationResult<AuditCampaignConsistencyOutput> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, value: null, errors: ["Output must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj["sourceId"] !== "string" || !obj["sourceId"]) errors.push("sourceId is required");
  if (typeof obj["sourceName"] !== "string" || !obj["sourceName"]) errors.push("sourceName is required");
  if (!Array.isArray(obj["findings"])) {
    errors.push("findings must be an array");
  } else {
    obj["findings"].forEach((f, i) => {
      if (!isConsistencyFinding(f)) errors.push(`findings[${i}] is invalid`);
    });
  }
  if (typeof obj["documentsAnalyzed"] !== "number" || obj["documentsAnalyzed"] < 0) {
    errors.push("documentsAnalyzed must be a non-negative number");
  }
  if (typeof obj["model"] !== "string") errors.push("model is required");

  if (errors.length > 0) return { valid: false, value: null, errors };
  return {
    valid: true,
    value: obj as unknown as AuditCampaignConsistencyOutput,
    errors: [],
  };
}
