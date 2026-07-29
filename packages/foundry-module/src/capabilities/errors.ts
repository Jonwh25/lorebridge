import type { ProtocolErrorCode } from "@lorebridge/shared";

export class LoreBridgeCapabilityError extends Error {
  readonly code: ProtocolErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ProtocolErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "LoreBridgeCapabilityError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.details !== undefined) this.details = options.details;
  }
}

export function requireFoundryGm(capability: string): void {
  if (typeof game === "undefined" || !game) {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry runtime is not available.", { retryable: true });
  }
  if (!game.user?.isGM) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", `LoreBridge ${capability} requires an active GM user.`);
  }
}
