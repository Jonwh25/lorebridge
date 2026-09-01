/**
 * Payload types for item create/update approval SSE events.
 * Sent from the backend to Foundry via the SSE channel.
 */

export type ItemCreateApprovalPayload = {
  itemStatData: Record<string, unknown>;
  edition: "modern" | "legacy";
  folderId?: string;
  rationale?: string;
};

export type ItemUpdateApprovalPayload = {
  itemId: string;
  itemName: string;
  itemStatData: Record<string, unknown>;
  edition: "modern" | "legacy";
  rationale?: string;
};
