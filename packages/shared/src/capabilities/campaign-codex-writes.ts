import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const PREVIEW_CAMPAIGN_CODEX_WRITE_CAPABILITY = "previewCampaignCodexWrite" as const;
export const PREVIEW_CAMPAIGN_CODEX_WRITE_DECLARATION: CapabilityDeclaration = { name: PREVIEW_CAMPAIGN_CODEX_WRITE_CAPABILITY, mode: "read", version: "0.1" };
export type CampaignCodexWriteAction = "create_folder" | "rename_folder" | "move_record" | "rename_record" | "set_location_marker" | "update_relationship";
export type CampaignCodexWriteOperation = {
  action: CampaignCodexWriteAction;
  name?: string; parentFolderId?: string; folderId?: string; newName?: string;
  documentType?: "JournalEntry"; documentId?: string; targetFolderId?: string;
  locationId?: string; sceneId?: string; x?: number; y?: number;
  sourceType?: "JournalEntry"; sourceId?: string; relation?: "location_region"; targetType?: "JournalEntry"; targetId?: string;
};
export type CampaignCodexWritePreview = { operation: CampaignCodexWriteOperation; beforeSummary: string; afterSummary: string; fingerprint: string; sourceId: string; sourceName: string };
export function validateCampaignCodexWritePreview(value: unknown): ValidationResult<CampaignCodexWritePreview> {
  if (!value || typeof value !== "object") return { valid: false, errors: ["Expected an object"] };
  const v = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!v.operation || typeof v.operation !== "object") errors.push("operation is required");
  if (typeof v.beforeSummary !== "string") errors.push("beforeSummary must be a string");
  if (typeof v.afterSummary !== "string") errors.push("afterSummary must be a string");
  if (typeof v.fingerprint !== "string" || !v.fingerprint) errors.push("fingerprint is required");
  if (typeof v.sourceId !== "string" || !v.sourceId) errors.push("sourceId is required");
  if (typeof v.sourceName !== "string") errors.push("sourceName must be a string");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as CampaignCodexWritePreview, errors: [] };
}
