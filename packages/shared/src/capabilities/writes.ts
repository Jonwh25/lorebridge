type ValidationResult<T> =
  | { valid: true; value: T; errors: string[] }
  | { valid: false; value?: undefined; errors: string[] };

/**
 * What the backend returns from POST /v1/write/approve.
 * Foundry receives this and executes the actual document update.
 */
export type ApproveWriteResult = {
  journalId: string;
  pageId: string;
  pageName: string;
  proposedContent: string;
};

/**
 * What LoreBridge.approveWrite() returns to the GM after the write completes.
 */
export type ApproveWriteOutput = {
  success: boolean;
  journalId: string;
  pageId: string;
  pageName: string;
};

export function validateApproveWriteResult(raw: unknown): ValidationResult<ApproveWriteResult> {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: ["Expected an object"] };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj["journalId"] !== "string" || !obj["journalId"]) errors.push("journalId must be a non-empty string");
  if (typeof obj["pageId"] !== "string" || !obj["pageId"]) errors.push("pageId must be a non-empty string");
  if (typeof obj["pageName"] !== "string" || !obj["pageName"]) errors.push("pageName must be a non-empty string");
  if (typeof obj["proposedContent"] !== "string" || !obj["proposedContent"]) errors.push("proposedContent must be a non-empty string");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: raw as ApproveWriteResult, errors: [] };
}
