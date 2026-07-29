import {
  LOREBRIDGE_PROTOCOL_VERSION,
  type AdapterRegistration,
  type ProtocolVersion,
  type ValidationResult,
  validateAdapterRegistration,
} from "./index.js";

export interface AdapterHelloMessage {
  kind: "adapter.hello";
  protocolVersion: ProtocolVersion;
  token: string;
  registration: AdapterRegistration;
}

export interface AdapterWelcomeMessage {
  kind: "adapter.welcome";
  protocolVersion: ProtocolVersion;
  sessionId: string;
  backendId: string;
  acceptedAt: string;
}

export interface AdapterSessionErrorMessage {
  kind: "adapter.error";
  protocolVersion: ProtocolVersion;
  code: "AUTHENTICATION_FAILED" | "INVALID_REQUEST" | "PROTOCOL_VERSION_UNSUPPORTED";
  message: string;
}

export type AdapterSessionControlMessage =
  | AdapterHelloMessage
  | AdapterWelcomeMessage
  | AdapterSessionErrorMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validateAdapterHelloMessage(
  value: unknown,
): ValidationResult<AdapterHelloMessage> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["adapter hello must be an object"] };
  if (value.kind !== "adapter.hello") errors.push("kind must be adapter.hello");
  if (value.protocolVersion !== LOREBRIDGE_PROTOCOL_VERSION) {
    errors.push(`protocolVersion must be ${LOREBRIDGE_PROTOCOL_VERSION}`);
  }
  if (typeof value.token !== "string" || value.token.length === 0) {
    errors.push("token must be a non-empty string");
  }
  const registration = validateAdapterRegistration(value.registration);
  if (!registration.valid) {
    errors.push(...registration.errors.map((error) => `registration.${error}`));
  }

  return errors.length === 0
    ? { valid: true, value: value as unknown as AdapterHelloMessage, errors }
    : { valid: false, errors };
}
