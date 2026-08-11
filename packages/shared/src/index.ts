export const LOREBRIDGE_PROTOCOL_VERSION = "0.1" as const;
export const LOREBRIDGE_PROTOCOL_MAJOR = 0 as const;
export const LOREBRIDGE_PROTOCOL_MINOR = 1 as const;

export type ProtocolVersion = typeof LOREBRIDGE_PROTOCOL_VERSION;
export type MessageId = string;
export type CorrelationId = string;
export type IsoTimestamp = string;
export type CapabilityName = string;

export interface SourceReference {
  sourceId: string;
  adapterId: string;
  sourceType: string;
  name: string;
}

export interface DocumentReference {
  sourceId: string;
  documentType: string;
  documentId: string;
  name?: string;
  parentDocumentId?: string;
}

export interface CapabilityDeclaration {
  name: CapabilityName;
  mode: "read" | "write";
  version: string;
  supportsPagination?: boolean;
  requiresApproval?: boolean;
}

export interface AdapterRegistration {
  adapterId: string;
  adapterType: string;
  adapterVersion: string;
  protocolVersions: string[];
  sources: SourceReference[];
  capabilities: CapabilityDeclaration[];
}

export interface PaginationRequest {
  cursor?: string;
  limit?: number;
}

export interface PaginationResult {
  nextCursor?: string;
  hasMore: boolean;
}

export interface RequestEnvelope<TInput = unknown> {
  kind: "request";
  messageId: MessageId;
  correlationId: CorrelationId;
  protocolVersion: ProtocolVersion;
  timestamp: IsoTimestamp;
  sourceId: string;
  capability: CapabilityName;
  input: TInput;
  pagination?: PaginationRequest;
}

export interface ResponseEnvelope<TOutput = unknown> {
  kind: "response";
  messageId: MessageId;
  correlationId: CorrelationId;
  protocolVersion: ProtocolVersion;
  timestamp: IsoTimestamp;
  success: true;
  output: TOutput;
  pagination?: PaginationResult;
  references?: DocumentReference[];
}

export type ProtocolErrorCode =
  | "AUTHENTICATION_FAILED"
  | "ADAPTER_UNAVAILABLE"
  | "CAPABILITY_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "PROTOCOL_VERSION_UNSUPPORTED"
  | "RATE_LIMITED"
  | "REQUEST_CANCELLED"
  | "REQUEST_TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "INTERNAL_ERROR";

export interface ErrorEnvelope {
  kind: "error";
  messageId: MessageId;
  correlationId: CorrelationId;
  protocolVersion: ProtocolVersion;
  timestamp: IsoTimestamp;
  success: false;
  error: {
    code: ProtocolErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface EventEnvelope<TPayload = unknown> {
  kind: "event";
  messageId: MessageId;
  protocolVersion: ProtocolVersion;
  timestamp: IsoTimestamp;
  sourceId: string;
  event: string;
  payload: TPayload;
}

export interface CancellationEnvelope {
  kind: "cancel";
  messageId: MessageId;
  correlationId: CorrelationId;
  protocolVersion: ProtocolVersion;
  timestamp: IsoTimestamp;
  reason?: string;
}

export type ProtocolMessage =
  | RequestEnvelope
  | ResponseEnvelope
  | ErrorEnvelope
  | EventEnvelope
  | CancellationEnvelope;

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasBaseFields = (value: Record<string, unknown>, errors: string[]): boolean => {
  if (!isNonEmptyString(value.messageId)) errors.push("messageId must be a non-empty string");
  if (value.protocolVersion !== LOREBRIDGE_PROTOCOL_VERSION) {
    errors.push(`protocolVersion must be ${LOREBRIDGE_PROTOCOL_VERSION}`);
  }
  if (!isNonEmptyString(value.timestamp) || Number.isNaN(Date.parse(value.timestamp))) {
    errors.push("timestamp must be a valid ISO-8601 date-time string");
  }
  return errors.length === 0;
};

export function validateAdapterRegistration(value: unknown): ValidationResult<AdapterRegistration> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["registration must be an object"] };

  if (!isNonEmptyString(value.adapterId)) errors.push("adapterId must be a non-empty string");
  if (!isNonEmptyString(value.adapterType)) errors.push("adapterType must be a non-empty string");
  if (!isNonEmptyString(value.adapterVersion)) errors.push("adapterVersion must be a non-empty string");
  if (!Array.isArray(value.protocolVersions) || !value.protocolVersions.every(isNonEmptyString)) {
    errors.push("protocolVersions must be an array of non-empty strings");
  }
  if (!Array.isArray(value.sources)) errors.push("sources must be an array");
  if (!Array.isArray(value.capabilities)) errors.push("capabilities must be an array");

  return errors.length === 0
    ? { valid: true, value: value as unknown as AdapterRegistration, errors }
    : { valid: false, errors };
}

export function validateProtocolMessage(value: unknown): ValidationResult<ProtocolMessage> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["message must be an object"] };

  hasBaseFields(value, errors);
  const kind = value.kind;

  if (kind === "request") {
    if (!isNonEmptyString(value.correlationId)) errors.push("correlationId is required");
    if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
    if (!isNonEmptyString(value.capability)) errors.push("capability is required");
    if (!("input" in value)) errors.push("input is required");
  } else if (kind === "response") {
    if (!isNonEmptyString(value.correlationId)) errors.push("correlationId is required");
    if (value.success !== true) errors.push("response success must be true");
    if (!("output" in value)) errors.push("output is required");
  } else if (kind === "error") {
    if (!isNonEmptyString(value.correlationId)) errors.push("correlationId is required");
    if (value.success !== false) errors.push("error success must be false");
    if (!isRecord(value.error) || !isNonEmptyString(value.error.code) || !isNonEmptyString(value.error.message)) {
      errors.push("error must include code and message");
    }
  } else if (kind === "event") {
    if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
    if (!isNonEmptyString(value.event)) errors.push("event is required");
    if (!("payload" in value)) errors.push("payload is required");
  } else if (kind === "cancel") {
    if (!isNonEmptyString(value.correlationId)) errors.push("correlationId is required");
  } else {
    errors.push("kind must be request, response, error, event, or cancel");
  }

  return errors.length === 0
    ? { valid: true, value: value as unknown as ProtocolMessage, errors }
    : { valid: false, errors };
}

export * from "./contract.js";
export * from "./adapter-session.js";
export * from "./ravens-eye.js";
export * from "./capabilities/journals.js";
export * from "./capabilities/actors.js";
export * from "./capabilities/scenes.js";
export * from "./capabilities/combat-writes.js";
export * from "./npc-dossier.js";
