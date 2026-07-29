import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  validateGetJournalOutput,
  validateGetJournalPageOutput,
  validateSearchJournalsInput,
  validateSearchJournalsOutput,
} from "@lorebridge/shared/capabilities";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import type { BackendServices } from "./journal-service.js";
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

function authenticate(pairing: PairingService, request: IncomingMessage, response: ServerResponse): boolean {
  const authorization = request.headers.authorization ?? "";
  const pairedClient = authorization.startsWith("Bearer ") ? pairing.verify(authorization.slice(7)) : undefined;
  if (pairedClient) return true;
  sendJson(response, 401, { error: { code: "unauthorized", message: "A valid LoreBridge pairing token is required." } });
  return false;
}

async function handleRequest(config: BackendConfig, identity: BackendIdentity, pairing: PairingService, services: BackendServices, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "lorebridge-backend", version: serviceVersion, pairingEnabled: config.pairingEnabled });
    return;
  }

  if (method === "GET" && url.pathname === "/v1") {
    const capabilities = config.pairingEnabled ? ["health", "identity", "pairing"] : ["health", "identity"];
    if (services.journals) capabilities.push("searchJournals", "getJournal", "getJournalPage");
    sendJson(response, 200, { service: "lorebridge-backend", version: serviceVersion, protocolVersion: "0.1", capabilities });
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

  if (method === "POST" && url.pathname === "/v1/journals/search") {
    if (!authenticate(pairing, request, response)) return;
    if (!services.journals) {
      sendJson(response, 503, { error: { code: "adapter_unavailable", message: "No journal data source is connected." } });
      return;
    }
    const body = await readJson(request);
    const validation = validateSearchJournalsInput(body);
    if (!validation.valid || !validation.value) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Journal search input is invalid.", details: validation.errors } });
      return;
    }
    const result = await services.journals.search(validation.value);
    const outputValidation = validateSearchJournalsOutput(result);
    if (!outputValidation.valid || !outputValidation.value) throw new Error(`Journal service returned invalid search output: ${outputValidation.errors.join(", ")}`);
    sendJson(response, 200, outputValidation.value);
    return;
  }

  const journalPageMatch = method === "GET" ? url.pathname.match(/^\/v1\/journals\/([^/]+)\/pages\/([^/]+)$/) : null;
  if (journalPageMatch) {
    if (!authenticate(pairing, request, response)) return;
    if (!services.journals) {
      sendJson(response, 503, { error: { code: "adapter_unavailable", message: "No journal data source is connected." } });
      return;
    }
    const journalId = decodeURIComponent(journalPageMatch[1] ?? "");
    const pageId = decodeURIComponent(journalPageMatch[2] ?? "");
    const page = await services.journals.getPage(journalId, pageId);
    if (!page) {
      sendJson(response, 404, { error: { code: "journal_page_not_found", message: "The requested journal page was not found." } });
      return;
    }
    const outputValidation = validateGetJournalPageOutput(page);
    if (!outputValidation.valid || !outputValidation.value) throw new Error(`Journal service returned invalid journal page output: ${outputValidation.errors.join(", ")}`);
    sendJson(response, 200, outputValidation.value);
    return;
  }

  const journalMatch = method === "GET" ? url.pathname.match(/^\/v1\/journals\/([^/]+)$/) : null;
  if (journalMatch) {
    if (!authenticate(pairing, request, response)) return;
    if (!services.journals) {
      sendJson(response, 503, { error: { code: "adapter_unavailable", message: "No journal data source is connected." } });
      return;
    }
    const journalId = decodeURIComponent(journalMatch[1] ?? "");
    const journal = await services.journals.get(journalId);
    if (!journal) {
      sendJson(response, 404, { error: { code: "journal_not_found", message: "The requested journal was not found." } });
      return;
    }
    const outputValidation = validateGetJournalOutput(journal);
    if (!outputValidation.valid || !outputValidation.value) throw new Error(`Journal service returned invalid journal output: ${outputValidation.errors.join(", ")}`);
    sendJson(response, 200, outputValidation.value);
    return;
  }

  sendJson(response, 404, { error: { code: "route_not_found", message: "The requested LoreBridge route does not exist." } });
}

export function createLoreBridgeServer(config: BackendConfig, identity: BackendIdentity, services: BackendServices = {}): Server {
  const pairing = new PairingService(identity, config.pairingTtlSeconds);
  return createServer((request, response) => {
    void handleRequest(config, identity, pairing, services, request, response).catch((error) => {
      console.error("LoreBridge request failed", error);
      if (!response.headersSent) sendJson(response, error instanceof SyntaxError ? 400 : 500, { error: { code: error instanceof SyntaxError ? "invalid_json" : "internal_error", message: "LoreBridge could not process the request." } });
      else response.end();
    });
  });
}
