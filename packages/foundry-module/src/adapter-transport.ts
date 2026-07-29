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

  connect(timeoutMs = 5_000): Promise<AdapterConnectionState> {
    if (!this.token) {
      this.#state = { state: "error", message: "LoreBridge is not paired with this backend." };
      return Promise.resolve(this.#state);
    }

    this.#state = { state: "connecting" };
    const socket = this.webSocketFactory(createAdapterWebSocketUrl(this.backendUrl));
    this.#socket = socket;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.#state = { state: "error", message: "LoreBridge backend connection timed out." };
        socket.close();
        resolve(this.#state);
      }, timeoutMs);

      socket.addEventListener("open", () => {
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
          clearTimeout(timeout);
          this.#state = { state: "error", message: "LoreBridge backend returned an invalid message." };
          socket.close();
          resolve(this.#state);
          return;
        }

        if (message.kind === "request") {
          void this.#handleRequest(socket, message);
        } else if (message.kind === "adapter.welcome") {
          clearTimeout(timeout);
          this.#state = {
            state: "connected",
            sessionId: message.sessionId,
            backendId: message.backendId,
          };
          resolve(this.#state);
        } else if (message.kind === "adapter.error") {
          clearTimeout(timeout);
          this.#state = { state: "error", message: message.message };
          socket.close();
          resolve(this.#state);
        }
      });

      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        this.#state = { state: "error", message: "Could not connect to the LoreBridge backend." };
        resolve(this.#state);
      });

      socket.addEventListener("close", () => {
        if (this.#state.state === "connected") this.#state = { state: "disconnected" };
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
    this.#socket?.close(1000, "LoreBridge module disconnected.");
    this.#state = { state: "disconnected" };
  }
}
