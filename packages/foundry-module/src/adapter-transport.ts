import {
  LOREBRIDGE_PROTOCOL_VERSION,
  type AdapterHelloMessage,
  type AdapterRegistration,
  type AdapterSessionControlMessage,
} from "@lorebridge/shared";

export type AdapterConnectionState =
  | { state: "disconnected" }
  | { state: "connecting" }
  | { state: "connected"; sessionId: string; backendId: string }
  | { state: "error"; message: string };

type WebSocketFactory = (url: string) => WebSocket;

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
        let message: AdapterSessionControlMessage;
        try {
          message = JSON.parse(String(event.data)) as AdapterSessionControlMessage;
        } catch {
          clearTimeout(timeout);
          this.#state = { state: "error", message: "LoreBridge backend returned an invalid message." };
          socket.close();
          resolve(this.#state);
          return;
        }

        if (message.kind === "adapter.welcome") {
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

  disconnect(): void {
    this.#socket?.close(1000, "LoreBridge module disconnected.");
    this.#state = { state: "disconnected" };
  }
}
