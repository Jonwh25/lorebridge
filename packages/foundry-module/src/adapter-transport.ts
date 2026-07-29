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
  autoReconnect?: boolean;
  maxReconnectDelayMs?: number;
};

const DEFAULT_CONNECTION_OPTIONS = {
  timeoutMs: 15_000,
  maxAttempts: 3,
  retryDelayMs: 1_000,
  autoReconnect: true,
  maxReconnectDelayMs: 30_000,
} as const;

type ResolvedConnectionOptions = Required<AdapterConnectionOptions>;

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
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #connectionOptions: ResolvedConnectionOptions = DEFAULT_CONNECTION_OPTIONS;

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
    const autoReconnect = options.autoReconnect ?? DEFAULT_CONNECTION_OPTIONS.autoReconnect;
    const maxReconnectDelayMs = options.maxReconnectDelayMs
      ?? DEFAULT_CONNECTION_OPTIONS.maxReconnectDelayMs;
    if (
      timeoutMs <= 0
      || maxAttempts < 1
      || retryDelayMs < 0
      || maxReconnectDelayMs < retryDelayMs
    ) {
      this.#state = { state: "error", message: "LoreBridge connection options are invalid." };
      return this.#state;
    }

    const generation = ++this.#connectionGeneration;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#reconnectAttempt = 0;
    this.#connectionOptions = {
      timeoutMs,
      maxAttempts,
      retryDelayMs,
      autoReconnect,
      maxReconnectDelayMs,
    };
    this.#socket?.close(1000, "LoreBridge connection replaced.");
    this.#state = { state: "connecting" };

    const result = await this.#runConnectionSequence(generation);
    if (
      result.state === "error"
      && generation === this.#connectionGeneration
      && this.#connectionOptions.autoReconnect
    ) {
      this.#scheduleReconnect(generation);
    }
    return result;
  }

  async #runConnectionSequence(
    generation: number,
  ): Promise<Extract<AdapterConnectionState, { state: "connected" | "error" }>> {
    const { timeoutMs, maxAttempts, retryDelayMs } = this.#connectionOptions;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.#connectAttempt(generation, timeoutMs);
      if (generation !== this.#connectionGeneration) {
        return { state: "error", message: "LoreBridge connection attempt was cancelled." };
      }
      if (result.state === "connected") {
        this.#reconnectAttempt = 0;
        return result;
      }
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
      if (generation !== this.#connectionGeneration) {
        return { state: "error", message: "LoreBridge connection attempt was cancelled." };
      }
    }

    return { state: "error", message: "LoreBridge could not connect to the backend." };
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
          if (this.#connectionOptions.autoReconnect) this.#scheduleReconnect(generation);
        }
      });
    });
  }

  #scheduleReconnect(generation: number): void {
    if (
      generation !== this.#connectionGeneration
      || !this.#connectionOptions.autoReconnect
      || this.#reconnectTimer
    ) {
      return;
    }

    const delay = Math.min(
      this.#connectionOptions.retryDelayMs * (2 ** this.#reconnectAttempt),
      this.#connectionOptions.maxReconnectDelayMs,
    );
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      if (generation !== this.#connectionGeneration) return;
      this.#state = { state: "connecting" };
      void this.#runConnectionSequence(generation).then((result) => {
        if (
          result.state === "error"
          && generation === this.#connectionGeneration
          && this.#connectionOptions.autoReconnect
        ) {
          this.#scheduleReconnect(generation);
        }
      });
    }, delay);
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
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#socket?.close(1000, "LoreBridge module disconnected.");
    this.#state = { state: "disconnected" };
  }
}
