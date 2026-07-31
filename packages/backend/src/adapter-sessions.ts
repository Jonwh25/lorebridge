import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import {
  createEventEnvelope,
  createRequestEnvelope,
  LOREBRIDGE_PROTOCOL_VERSION,
  type AdapterHelloMessage,
  type AdapterRegistration,
  type AdapterSessionErrorMessage,
  type AdapterWelcomeMessage,
  type ErrorEnvelope,
  type LoreBridgeCapability,
  type ProtocolErrorCode,
  type ProtocolMessage,
  type ResponseEnvelope,
  validateProtocolMessage,
  validateAdapterHelloMessage,
} from "@lorebridge/shared";
import { WebSocket, WebSocketServer } from "ws";
import type { PairingService } from "./pairing.js";

export interface AdapterSessionSummary {
  sessionId: string;
  clientId: string;
  clientName: string;
  connectedAt: string;
  registration: AdapterRegistration;
}

interface AdapterSession {
  summary: AdapterSessionSummary;
  socket: WebSocket;
}

interface PendingRequest {
  sessionId: string;
  resolve: (message: ResponseEnvelope) => void;
  reject: (error: AdapterInvocationError) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class AdapterInvocationError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
    readonly retryable = false,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AdapterInvocationError";
  }
}

export class AdapterSessionRegistry {
  readonly #sessions = new Map<string, AdapterSession>();
  readonly #pendingRequests = new Map<string, PendingRequest>();

  add(summary: AdapterSessionSummary, socket: WebSocket): void {
    this.#sessions.set(summary.sessionId, { summary, socket });
  }

  remove(sessionId: string): void {
    this.#sessions.delete(sessionId);
    for (const [correlationId, pending] of this.#pendingRequests) {
      if (pending.sessionId !== sessionId) continue;
      clearTimeout(pending.timeout);
      pending.reject(new AdapterInvocationError(
        "ADAPTER_UNAVAILABLE",
        "The Foundry adapter disconnected before responding.",
        true,
      ));
      this.#pendingRequests.delete(correlationId);
    }
  }

  list(): AdapterSessionSummary[] {
    return [...this.#sessions.values()].map(({ summary }) => summary);
  }

  hasCapability(capability: LoreBridgeCapability): boolean {
    return [...this.#sessions.values()].some(({ summary, socket }) =>
      socket.readyState === WebSocket.OPEN
      && summary.registration.capabilities.some(
        (declaration) => declaration.name === capability,
      ),
    );
  }

  sendEvent<TPayload>(
    sourceId: string | undefined,
    event: string,
    payload: TPayload,
  ): void {
    const targets = [...this.#sessions.values()].filter(({ summary, socket }) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      if (!sourceId) return true;
      return summary.registration.sources.some((s) => s.sourceId === sourceId);
    });
    if (targets.length === 0) return;
    const resolvedSourceId = sourceId
      ?? targets[0]!.summary.registration.sources[0]?.sourceId
      ?? "unknown";
    const envelope = createEventEnvelope(`message_${randomUUID()}`, resolvedSourceId, event, payload);
    const json = JSON.stringify(envelope);
    for (const { socket } of targets) socket.send(json);
  }

  async invoke<TOutput>(
    sourceId: string | undefined,
    capability: LoreBridgeCapability,
    input: unknown,
    timeoutMs = 5_000,
  ): Promise<TOutput> {
    const candidates = [...this.#sessions.values()].filter(({ summary, socket }) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      const hasSource = sourceId
        ? summary.registration.sources.some((source) => source.sourceId === sourceId)
        : true;
      const hasCapability = summary.registration.capabilities.some(
        (declaration) => declaration.name === capability,
      );
      return hasSource && hasCapability;
    });

    if (candidates.length !== 1) {
      throw new AdapterInvocationError(
        "ADAPTER_UNAVAILABLE",
        sourceId
          ? `No connected adapter provides ${capability} for ${sourceId}.`
          : candidates.length === 0
            ? `No connected adapter provides ${capability}.`
            : `Multiple connected adapters provide ${capability}; sourceId is required.`,
        true,
      );
    }

    const session = candidates[0]!;
    const resolvedSourceId = sourceId ?? session.summary.registration.sources[0]?.sourceId;
    if (!resolvedSourceId) {
      throw new AdapterInvocationError("ADAPTER_UNAVAILABLE", "The adapter has no registered source.");
    }

    const correlationId = `correlation_${randomUUID()}`;
    const request = createRequestEnvelope(
      { messageId: `message_${randomUUID()}`, correlationId },
      resolvedSourceId,
      capability,
      input,
    );

    return new Promise<TOutput>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(correlationId);
        reject(new AdapterInvocationError(
          "REQUEST_TIMEOUT",
          `The Foundry adapter did not respond within ${timeoutMs}ms.`,
          true,
        ));
      }, timeoutMs);

      this.#pendingRequests.set(correlationId, {
        sessionId: session.summary.sessionId,
        timeout,
        resolve: (message) => resolve(message.output as TOutput),
        reject,
      });
      session.socket.send(JSON.stringify(request));
    });
  }

  accept(sessionId: string, message: ProtocolMessage): void {
    if (message.kind !== "response" && message.kind !== "error") return;
    const pending = this.#pendingRequests.get(message.correlationId);
    if (!pending || pending.sessionId !== sessionId) return;

    clearTimeout(pending.timeout);
    this.#pendingRequests.delete(message.correlationId);
    if (message.kind === "response") {
      pending.resolve(message);
      return;
    }

    const error = message as ErrorEnvelope;
    pending.reject(new AdapterInvocationError(
      error.error.code,
      error.error.message,
      error.error.retryable,
      error.error.details,
    ));
  }
}

function send(socket: WebSocket, message: AdapterWelcomeMessage | AdapterSessionErrorMessage): void {
  socket.send(JSON.stringify(message));
}

function reject(
  socket: WebSocket,
  code: AdapterSessionErrorMessage["code"],
  message: string,
): void {
  send(socket, {
    kind: "adapter.error",
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    code,
    message,
  });
  socket.close(1008, message);
}

export function attachAdapterSessionServer(
  server: Server,
  backendId: string,
  pairing: PairingService,
  registry: AdapterSessionRegistry,
): void {
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/v1/adapter") {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSockets.emit("connection", webSocket, request);
    });
  });

  webSockets.on("connection", (socket) => {
    let sessionId: string | undefined;
    const authenticationTimeout = setTimeout(() => {
      reject(socket, "AUTHENTICATION_FAILED", "Adapter authentication timed out.");
    }, 5_000);

    socket.once("message", (data, isBinary) => {
      clearTimeout(authenticationTimeout);
      if (isBinary) {
        reject(socket, "INVALID_REQUEST", "Binary adapter messages are not supported.");
        return;
      }

      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        reject(socket, "INVALID_REQUEST", "Adapter hello must be valid JSON.");
        return;
      }

      const validation = validateAdapterHelloMessage(message);
      if (!validation.valid || !validation.value) {
        reject(socket, "INVALID_REQUEST", "Adapter hello is invalid.");
        return;
      }

      const hello: AdapterHelloMessage = validation.value;
      const pairedClient = pairing.verify(hello.token);
      if (!pairedClient) {
        reject(socket, "AUTHENTICATION_FAILED", "A valid LoreBridge pairing token is required.");
        return;
      }

      sessionId = `session_${randomUUID()}`;
      const connectedAt = new Date().toISOString();
      registry.add({
        sessionId,
        clientId: pairedClient.clientId,
        clientName: pairedClient.clientName,
        connectedAt,
        registration: hello.registration,
      }, socket);
      send(socket, {
        kind: "adapter.welcome",
        protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
        sessionId,
        backendId,
        acceptedAt: connectedAt,
      });

      socket.on("message", (nextData, nextIsBinary) => {
        if (nextIsBinary || !sessionId) return;
        let nextMessage: unknown;
        try {
          nextMessage = JSON.parse(nextData.toString());
        } catch {
          return;
        }
        const nextValidation = validateProtocolMessage(nextMessage);
        if (nextValidation.valid && nextValidation.value) {
          registry.accept(sessionId, nextValidation.value);
        }
      });
    });

    socket.on("close", () => {
      clearTimeout(authenticationTimeout);
      if (sessionId) registry.remove(sessionId);
    });
  });

  server.on("close", () => {
    for (const client of webSockets.clients) client.terminate();
    webSockets.close();
  });
}
