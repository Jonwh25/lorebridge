import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import { PairingService } from "./pairing.js";

const serviceVersion = "0.2.0";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function handleRequest(config: BackendConfig, identity: BackendIdentity, pairing: PairingService, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "lorebridge-backend", version: serviceVersion, pairingEnabled: config.pairingEnabled });
    return;
  }

  if (method === "GET" && url.pathname === "/v1") {
    sendJson(response, 200, { service: "lorebridge-backend", version: serviceVersion, protocolVersion: "0.1", capabilities: config.pairingEnabled ? ["health", "identity", "pairing"] : ["health", "identity"] });
    return;
  }

  if (method === "GET" && url.pathname === "/v1/identity") {
    sendJson(response, 200, { id: identity.id, fingerprint: identity.fingerprint, createdAt: identity.createdAt });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/pairing/start") {
    if (!config.pairingEnabled) {
      sendJson(response, 403, { error: { code: "pairing_disabled", message: "Pairing is disabled." } });
      return;
    }
    sendJson(response, 201, pairing.start());
    return;
  }

  if (method === "POST" && url.pathname === "/v1/pairing/complete") {
    if (!config.pairingEnabled) {
      sendJson(response, 403, { error: { code: "pairing_disabled", message: "Pairing is disabled." } });
      return;
    }
    const body = await readJson(request);
    const result = pairing.complete(typeof body.code === "string" ? body.code : "", typeof body.clientName === "string" ? body.clientName : "Foundry VTT");
    if (!result) {
      sendJson(response, 401, { error: { code: "invalid_pairing_code", message: "The pairing code is invalid or expired." } });
      return;
    }
    sendJson(response, 201, { ...result, backendId: identity.id, fingerprint: identity.fingerprint });
    return;
  }

  if (method === "GET" && url.pathname === "/v1/pairing/status") {
    const authorization = request.headers.authorization ?? "";
    const pairedClient = authorization.startsWith("Bearer ") ? pairing.verify(authorization.slice(7)) : undefined;
    if (!pairedClient) {
      sendJson(response, 401, { error: { code: "unauthorized", message: "A valid LoreBridge pairing token is required." } });
      return;
    }
    sendJson(response, 200, { paired: true, backendId: identity.id, clientId: pairedClient.clientId, clientName: pairedClient.clientName });
    return;
  }

  sendJson(response, 404, { error: { code: "route_not_found", message: "The requested LoreBridge route does not exist." } });
}

export function createLoreBridgeServer(config: BackendConfig, identity: BackendIdentity): Server {
  const pairing = new PairingService(identity, config.pairingTtlSeconds);
  return createServer((request, response) => {
    void handleRequest(config, identity, pairing, request, response).catch((error) => {
      console.error("LoreBridge request failed", error);
      if (!response.headersSent) sendJson(response, error instanceof SyntaxError ? 400 : 500, { error: { code: error instanceof SyntaxError ? "invalid_json" : "internal_error", message: "LoreBridge could not process the request." } });
      else response.end();
    });
  });
}
