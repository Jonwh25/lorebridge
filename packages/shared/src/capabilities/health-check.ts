import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const CHECK_CAMPAIGN_HEALTH_CAPABILITY = "checkCampaignHealth" as const;

export type HealthCheckCategory =
  | "broken-link"
  | "missing-asset"
  | "permission-exposure"
  | "duplicate-name"
  | "empty-folder";

export type HealthFindingSeverity = "error" | "warning";

export interface HealthFinding {
  category: HealthCheckCategory;
  severity: HealthFindingSeverity;
  sourceUuid: string;
  sourceName: string;
  detail: string;
  targetUuid?: string;
}

export interface CheckCampaignHealthInput {
  checks?: HealthCheckCategory[];
  limit?: number;
}

export interface CheckCampaignHealthOutput {
  sourceId: string;
  sourceName: string;
  findings: HealthFinding[];
  checksRun: HealthCheckCategory[];
  documentsScanned: number;
  truncated: boolean;
}

export const CHECK_CAMPAIGN_HEALTH_DECLARATION: CapabilityDeclaration = {
  name: CHECK_CAMPAIGN_HEALTH_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const ALL_HEALTH_CHECK_CATEGORIES: HealthCheckCategory[] = [
  "broken-link",
  "missing-asset",
  "permission-exposure",
  "duplicate-name",
  "empty-folder",
];

const SEVERITIES: HealthFindingSeverity[] = ["error", "warning"];
export const HEALTH_CHECK_MAX_LIMIT = 500;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validateCheckCampaignHealthInput(
  value: unknown,
): ValidationResult<CheckCampaignHealthInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };

  if (value.checks !== undefined) {
    if (!Array.isArray(value.checks) || value.checks.length === 0) {
      errors.push("checks must be a non-empty array");
    } else {
      (value.checks as unknown[]).forEach((c, i) => {
        if (!ALL_HEALTH_CHECK_CATEGORIES.includes(c as HealthCheckCategory)) {
          errors.push(`checks[${i}] must be one of: ${ALL_HEALTH_CHECK_CATEGORIES.join(", ")}`);
        }
      });
    }
  }

  if (value.limit !== undefined) {
    if (
      !Number.isInteger(value.limit) ||
      (value.limit as number) < 1 ||
      (value.limit as number) > HEALTH_CHECK_MAX_LIMIT
    ) {
      errors.push(`limit must be an integer between 1 and ${HEALTH_CHECK_MAX_LIMIT}`);
    }
  }

  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as CheckCampaignHealthInput, errors: [] };
}

export function validateCheckCampaignHealthOutput(
  value: unknown,
): ValidationResult<CheckCampaignHealthOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };

  if (typeof value.sourceId !== "string" || !value.sourceId) errors.push("sourceId is required");
  if (typeof value.sourceName !== "string" || !value.sourceName) errors.push("sourceName is required");
  if (
    typeof value.documentsScanned !== "number" ||
    !Number.isInteger(value.documentsScanned) ||
    (value.documentsScanned as number) < 0
  ) {
    errors.push("documentsScanned must be a non-negative integer");
  }
  if (typeof value.truncated !== "boolean") errors.push("truncated must be a boolean");

  if (!Array.isArray(value.checksRun)) {
    errors.push("checksRun must be an array");
  } else {
    (value.checksRun as unknown[]).forEach((c, i) => {
      if (!ALL_HEALTH_CHECK_CATEGORIES.includes(c as HealthCheckCategory)) {
        errors.push(`checksRun[${i}] must be a valid check category`);
      }
    });
  }

  if (!Array.isArray(value.findings)) {
    errors.push("findings must be an array");
  } else {
    (value.findings as unknown[]).forEach((f, i) => {
      if (!isRecord(f)) { errors.push(`findings[${i}] must be an object`); return; }
      if (!ALL_HEALTH_CHECK_CATEGORIES.includes(f.category as HealthCheckCategory)) {
        errors.push(`findings[${i}].category must be a valid check category`);
      }
      if (!SEVERITIES.includes(f.severity as HealthFindingSeverity)) {
        errors.push(`findings[${i}].severity must be 'error' or 'warning'`);
      }
      if (typeof f.sourceUuid !== "string" || !f.sourceUuid) {
        errors.push(`findings[${i}].sourceUuid is required`);
      }
      if (typeof f.sourceName !== "string" || !f.sourceName) {
        errors.push(`findings[${i}].sourceName is required`);
      }
      if (typeof f.detail !== "string" || !f.detail) {
        errors.push(`findings[${i}].detail is required`);
      }
      if (f.targetUuid !== undefined && (typeof f.targetUuid !== "string" || !f.targetUuid)) {
        errors.push(`findings[${i}].targetUuid must be a non-empty string if provided`);
      }
    });
  }

  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as CheckCampaignHealthOutput, errors: [] };
}
