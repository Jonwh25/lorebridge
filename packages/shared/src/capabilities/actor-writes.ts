/**
 * Payload types for actor create/update approval SSE events.
 * These are sent from the backend to Foundry via the SSE channel.
 * The shape mirrors NpcStatBlockResult from packages/backend/src/generation.ts.
 */

export type ActorCreateApprovalPayload = {
  npcStatBlock: Record<string, unknown>;
  edition: "modern" | "legacy";
  folderId?: string;
  rationale?: string;
};

export type ActorUpdateApprovalPayload = {
  actorId: string;
  actorName: string;
  npcStatBlock: Record<string, unknown>;
  edition: "modern" | "legacy";
  rationale?: string;
};
