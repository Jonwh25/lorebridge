import {
  LOREBRIDGE_PROTOCOL_VERSION,
  type ErrorEnvelope,
  type EventEnvelope,
  type ProtocolErrorCode,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "./index.js";

export const LOREBRIDGE_CAPABILITIES = Object.freeze({
  health: "health",
  identity: "identity",
  pairing: "pairing",
  getWorldSummary: "getWorldSummary",
  searchJournals: "searchJournals",
  getJournal: "getJournal",
  getJournalPage: "getJournalPage",
  searchActors: "searchActors",
  getActor: "getActor",
  searchScenes: "searchScenes",
  getScene: "getScene",
  getActiveScene: "getActiveScene",
  getCombatState: "getCombatState",
  rollDice: "rollDice",
  getChatMessages: "getChatMessages",
  searchAssets: "searchAssets",
  resolveUuid: "resolveUuid",
  searchCampaign: "searchCampaign",
  getRelatedDocuments: "getRelatedDocuments",
  searchItems: "searchItems",
  getActorInventory: "getActorInventory",
  searchSessionLogs: "searchSessionLogs",
  getSessionLog: "getSessionLog",
  listCompendiums: "listCompendiums",
  searchCompendium: "searchCompendium",
  getCompendiumEntry: "getCompendiumEntry",
  listMacroTools: "listMacroTools",
  executeMacroTool: "executeMacroTool",
} as const);

export const LOREBRIDGE_EVENTS = Object.freeze({
  progress: "progress",
  approvalRequired: "approval.required",
  rollTableApprovalRequired: "roll-table.approval.required",
  rollbackAvailable: "rollback.available",
  capabilityChanged: "capability.changed",
} as const);

export type LoreBridgeCapability =
  (typeof LOREBRIDGE_CAPABILITIES)[keyof typeof LOREBRIDGE_CAPABILITIES];

export type LoreBridgeEvent =
  (typeof LOREBRIDGE_EVENTS)[keyof typeof LOREBRIDGE_EVENTS];

export interface EnvelopeMetadata {
  messageId: string;
  correlationId: string;
  timestamp?: string;
}

function timestamp(value?: string): string {
  return value ?? new Date().toISOString();
}

export function createRequestEnvelope<TInput>(
  metadata: EnvelopeMetadata,
  sourceId: string,
  capability: LoreBridgeCapability,
  input: TInput,
): RequestEnvelope<TInput> {
  return {
    kind: "request",
    messageId: metadata.messageId,
    correlationId: metadata.correlationId,
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    timestamp: timestamp(metadata.timestamp),
    sourceId,
    capability,
    input,
  };
}

export function createResponseEnvelope<TOutput>(
  metadata: EnvelopeMetadata,
  output: TOutput,
): ResponseEnvelope<TOutput> {
  return {
    kind: "response",
    messageId: metadata.messageId,
    correlationId: metadata.correlationId,
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    timestamp: timestamp(metadata.timestamp),
    success: true,
    output,
  };
}

export function createErrorEnvelope(
  metadata: EnvelopeMetadata,
  code: ProtocolErrorCode,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return {
    kind: "error",
    messageId: metadata.messageId,
    correlationId: metadata.correlationId,
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    timestamp: timestamp(metadata.timestamp),
    success: false,
    error: {
      code,
      message,
      retryable,
      ...(details ? { details } : {}),
    },
  };
}

export function createEventEnvelope<TPayload>(
  messageId: string,
  sourceId: string,
  event: LoreBridgeEvent,
  payload: TPayload,
  eventTimestamp?: string,
): EventEnvelope<TPayload> {
  return {
    kind: "event",
    messageId,
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    timestamp: timestamp(eventTimestamp),
    sourceId,
    event,
    payload,
  };
}
