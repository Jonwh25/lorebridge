import {
  createErrorEnvelope,
  createResponseEnvelope,
  LOREBRIDGE_PROTOCOL_VERSION,
  type AdapterHelloMessage,
  type AdapterRegistration,
  type AdapterSessionControlMessage,
  type ProtocolMessage,
  type RequestEnvelope,
  validateProtocolMessage,
} from "@lorebridge/shared";
import { LoreBridgeCapabilityError } from "./capabilities/errors.js";

export type AdapterConnectionState =
  | { state: "disconnected" }
  | { state: "connecting" }
  | { state: "connected"; sessionId: string; backendId: string }
  | { state: "error"; message: string };

type WebSocketFactory = (url: string) => WebSocket;
type CapabilityDispatcher = (request: RequestEnvelope) => unknown | Promise<unknown>;

export type AdapterConnectionOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const DEFAULT_CONNECTION_OPTIONS = {
  timeoutMs: 15_000,
  maxAttempts: 3,
  retryDelayMs: 1_000,
} as const;

export function createAdapterWebSocketUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL("v1/adapter", normalizedBase);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else throw new Error("LoreBridge backend URL must use HTTP or HTTPS.");
  return url.toString();
}

export class LoreBridgeAdapterTransport {
  #socket?: WebSocket;
  #state: AdapterConnectionState = { state: "disconnected" };
  #connectionGeneration = 0;

  constructor(
    private readonly backendUrl: string,
    private readonly token: string,
    private readonly registration: AdapterRegistration,
    private readonly dispatchCapability?: CapabilityDispatcher,
    private readonly webSocketFactory: WebSocketFactory = (url) => new WebSocket(url),
  ) {}

  get state(): AdapterConnectionState {
    return this.#state;
  }

  async connect(options: AdapterConnectionOptions = {}): Promise<AdapterConnectionState> {
    if (!this.token) {
      this.#state = { state: "error", message: "LoreBridge is not paired with this backend." };
      return this.#state;
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_CONNECTION_OPTIONS.timeoutMs;
    const maxAttempts = options.maxAttempts ?? DEFAULT_CONNECTION_OPTIONS.maxAttempts;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_CONNECTION_OPTIONS.retryDelayMs;
    if (timeoutMs <= 0 || maxAttempts < 1 || retryDelayMs < 0) {
      this.#state = { state: "error", message: "LoreBridge connection options are invalid." };
      return this.#state;
    }

    const generation = ++this.#connectionGeneration;
    this.#socket?.close(1000, "LoreBridge connection replaced.");
    this.#state = { state: "connecting" };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.#connectAttempt(generation, timeoutMs);
      if (generation !== this.#connectionGeneration) return this.#state;
      if (result.state === "connected") return result;
      if (attempt === maxAttempts) {
        this.#state = {
          state: "error",
          message: `${result.message} (${maxAttempts} attempts.)`,
        };
        return this.#state;
      }

      this.#state = { state: "connecting" };
      await new Promise((resolve) => {
        setTimeout(resolve, retryDelayMs * (2 ** (attempt - 1)));
      });
      if (generation !== this.#connectionGeneration) return this.#state;
    }

    return this.#state;
  }

  #connectAttempt(
    generation: number,
    timeoutMs: number,
  ): Promise<Extract<AdapterConnectionState, { state: "connected" | "error" }>> {
    const socket = this.webSocketFactory(createAdapterWebSocketUrl(this.backendUrl));
    this.#socket = socket;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (
        state: Extract<AdapterConnectionState, { state: "connected" | "error" }>,
        closeSocket = false,
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (generation === this.#connectionGeneration) this.#state = state;
        if (closeSocket) socket.close();
        resolve(state);
      };
      const timeout = setTimeout(() => {
        finish(
          { state: "error", message: "LoreBridge backend connection timed out." },
          true,
        );
      }, timeoutMs);

      socket.addEventListener("open", () => {
        if (generation !== this.#connectionGeneration) return;
        const hello: AdapterHelloMessage = {
          kind: "adapter.hello",
          protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
          token: this.token,
          registration: this.registration,
        };
        socket.send(JSON.stringify(hello));
      });

      socket.addEventListener("message", (event) => {
        let message: AdapterSessionControlMessage | ProtocolMessage;
        try {
          message = JSON.parse(String(event.data)) as AdapterSessionControlMessage | ProtocolMessage;
        } catch {
          finish(
            { state: "error", message: "LoreBridge backend returned an invalid message." },
            true,
          );
          return;
        }

        if (message.kind === "request") {
          void this.#handleRequest(socket, message);
        } else if (message.kind === "adapter.welcome") {
          finish({
            state: "connected",
            sessionId: message.sessionId,
            backendId: message.backendId,
          });
        } else if (message.kind === "adapter.error") {
          finish({ state: "error", message: message.message }, true);
        }
      });

      socket.addEventListener("error", () => {
        finish({ state: "error", message: "Could not connect to the LoreBridge backend." });
      });

      socket.addEventListener("close", () => {
        if (generation !== this.#connectionGeneration || socket !== this.#socket) return;
        if (!settled) {
          finish({ state: "error", message: "LoreBridge backend closed the connection." });
        } else if (this.#state.state === "connected") {
          this.#state = { state: "disconnected" };
        }
      });
    });
  }

  async #handleRequest(socket: WebSocket, value: unknown): Promise<void> {
    const validation = validateProtocolMessage(value);
    if (!validation.valid || validation.value?.kind !== "request") return;
    const request = validation.value;
    const metadata = {
      messageId: crypto.randomUUID(),
      correlationId: request.correlationId,
    };

    try {
      if (!this.dispatchCapability) {
        throw new LoreBridgeCapabilityError(
          "CAPABILITY_UNAVAILABLE",
          "No Foundry capability dispatcher is configured.",
        );
      }
      const output = await this.dispatchCapability(request);
      socket.send(JSON.stringify(createResponseEnvelope(metadata, output)));
    } catch (error) {
      const capabilityError = error instanceof LoreBridgeCapabilityError
        ? error
        : new LoreBridgeCapabilityError(
          "INTERNAL_ERROR",
          "LoreBridge could not execute the requested Foundry capability.",
          { cause: error },
        );
      socket.send(JSON.stringify(createErrorEnvelope(
        metadata,
        capabilityError.code,
        capabilityError.message,
        capabilityError.retryable,
        capabilityError.details,
      )));
    }
  }

  disconnect(): void {
    this.#connectionGeneration += 1;
    this.#socket?.close(1000, "LoreBridge module disconnected.");
    this.#state = { state: "disconnected" };
  }
}
