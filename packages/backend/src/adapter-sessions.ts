import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import {
  LOREBRIDGE_PROTOCOL_VERSION,
  type AdapterHelloMessage,
  type AdapterRegistration,
  type AdapterSessionErrorMessage,
  type AdapterWelcomeMessage,
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

export class AdapterSessionRegistry {
  readonly #sessions = new Map<string, AdapterSessionSummary>();

  add(session: AdapterSessionSummary): void {
    this.#sessions.set(session.sessionId, session);
  }

  remove(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }

  list(): AdapterSessionSummary[] {
    return [...this.#sessions.values()];
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
      });
      send(socket, {
        kind: "adapter.welcome",
        protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
        sessionId,
        backendId,
        acceptedAt: connectedAt,
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
