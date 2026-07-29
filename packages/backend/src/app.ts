import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  GET_ACTOR_CAPABILITY,
  GET_JOURNAL_PAGE_CAPABILITY,
  GET_WORLD_SUMMARY_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  SEARCH_ACTORS_CAPABILITY,
  validateGetActorOutput,
  validateGetWorldSummaryOutput,
  validateGetJournalOutput,
  validateGetJournalPageOutput,
  validateSearchJournalsInput,
  validateSearchJournalsOutput,
  validateSearchActorsInput,
  validateSearchActorsOutput,
} from "@lorebridge/shared/capabilities";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import type { BackendServices } from "./journal-service.js";
import { PairingService } from "./pairing.js";
import {
  AdapterInvocationError,
  AdapterSessionRegistry,
  attachAdapterSessionServer,
} from "./adapter-sessions.js";
import {
  createLoreBridgeMcpHandler,
  type McpRequestHandler,
} from "./mcp.js";

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

function sendAdapterInvocationError(response: ServerResponse, error: AdapterInvocationError): void {
  const status = error.code === "REQUEST_TIMEOUT" ? 504
    : error.code === "NOT_AUTHORIZED" ? 403
    : error.code === "INVALID_REQUEST" ? 400
    : error.code === "NOT_FOUND" ? 404
    : error.code === "ADAPTER_UNAVAILABLE" || error.code === "CAPABILITY_UNAVAILABLE" ? 503
    : 502;
  sendJson(response, status, {
    error: {
      code: error.code.toLowerCase(),
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

async function handleRequest(config: BackendConfig, identity: BackendIdentity, pairing: PairingService, adapterSessions: AdapterSessionRegistry, services: BackendServices, mcp: McpRequestHandler, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname === "/mcp") {
    if (!authenticate(pairing, request, response)) return;
    await mcp.handle(request, response);
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "lorebridge-backend", version: serviceVersion, pairingEnabled: config.pairingEnabled });
    return;
  }

  if (method === "GET" && url.pathname === "/v1") {
    const capabilities = config.pairingEnabled
      ? ["health", "identity", "pairing", "mcp"]
      : ["health", "identity", "mcp"];
    if (services.journals) capabilities.push("searchJournals", "getJournal", "getJournalPage");
    else {
      if (adapterSessions.hasCapability(SEARCH_JOURNALS_CAPABILITY)) capabilities.push("searchJournals");
      if (adapterSessions.hasCapability(GET_JOURNAL_PAGE_CAPABILITY)) capabilities.push("getJournalPage");
      if (adapterSessions.hasCapability(SEARCH_ACTORS_CAPABILITY)) capabilities.push("searchActors");
      if (adapterSessions.hasCapability(GET_ACTOR_CAPABILITY)) capabilities.push("getActor");
    }
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

  if (method === "GET" && url.pathname === "/v1/adapters") {
    if (!authenticate(pairing, request, response)) return;
    sendJson(response, 200, { adapters: adapterSessions.list() });
    return;
  }

  if (method === "GET" && url.pathname === "/v1/world-summary") {
    if (!authenticate(pairing, request, response)) return;
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    try {
      const result = await adapterSessions.invoke(
        sourceId,
        GET_WORLD_SUMMARY_CAPABILITY,
        {},
      );
      const validation = validateGetWorldSummaryOutput(result);
      if (!validation.valid || !validation.value) {
        throw new AdapterInvocationError(
          "INTERNAL_ERROR",
          "The Foundry adapter returned an invalid world summary.",
          false,
          { validationErrors: validation.errors },
        );
      }
      sendJson(response, 200, validation.value);
    } catch (error) {
      if (!(error instanceof AdapterInvocationError)) throw error;
      sendAdapterInvocationError(response, error);
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/journals/search") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const validation = validateSearchJournalsInput(body);
    if (!validation.valid || !validation.value) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Journal search input is invalid.", details: validation.errors } });
      return;
    }
    let result: unknown;
    if (services.journals) {
      result = await services.journals.search(validation.value);
    } else {
      const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
      try {
        result = await adapterSessions.invoke(
          sourceId,
          SEARCH_JOURNALS_CAPABILITY,
          validation.value,
        );
      } catch (error) {
        if (!(error instanceof AdapterInvocationError)) throw error;
        sendAdapterInvocationError(response, error);
        return;
      }
    }
    const outputValidation = validateSearchJournalsOutput(result);
    if (!outputValidation.valid || !outputValidation.value) throw new Error(`Journal service returned invalid search output: ${outputValidation.errors.join(", ")}`);
    sendJson(response, 200, outputValidation.value);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/actors/search") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const validation = validateSearchActorsInput(body);
    if (!validation.valid || !validation.value) {
      sendJson(response, 400, {
        error: {
          code: "invalid_request",
          message: "Actor search input is invalid.",
          details: validation.errors,
        },
      });
      return;
    }
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    try {
      const result = await adapterSessions.invoke(
        sourceId,
        SEARCH_ACTORS_CAPABILITY,
        validation.value,
      );
      const outputValidation = validateSearchActorsOutput(result);
      if (!outputValidation.valid || !outputValidation.value) {
        throw new AdapterInvocationError(
          "INTERNAL_ERROR",
          "The Foundry adapter returned invalid actor search results.",
          false,
          { validationErrors: outputValidation.errors },
        );
      }
      sendJson(response, 200, outputValidation.value);
    } catch (error) {
      if (!(error instanceof AdapterInvocationError)) throw error;
      sendAdapterInvocationError(response, error);
    }
    return;
  }

  const actorMatch = method === "GET" ? url.pathname.match(/^\/v1\/actors\/([^/]+)$/) : null;
  if (actorMatch) {
    if (!authenticate(pairing, request, response)) return;
    const actorId = decodeURIComponent(actorMatch[1] ?? "");
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    try {
      const result = await adapterSessions.invoke(
        sourceId,
        GET_ACTOR_CAPABILITY,
        { actorId },
      );
      const outputValidation = validateGetActorOutput(result);
      if (!outputValidation.valid || !outputValidation.value) {
        throw new AdapterInvocationError(
          "INTERNAL_ERROR",
          "The Foundry adapter returned an invalid actor.",
          false,
          { validationErrors: outputValidation.errors },
        );
      }
      sendJson(response, 200, outputValidation.value);
    } catch (error) {
      if (!(error instanceof AdapterInvocationError)) throw error;
      sendAdapterInvocationError(response, error);
    }
    return;
  }

  const journalPageMatch = method === "GET" ? url.pathname.match(/^\/v1\/journals\/([^/]+)\/pages\/([^/]+)$/) : null;
  if (journalPageMatch) {
    if (!authenticate(pairing, request, response)) return;
    const journalId = decodeURIComponent(journalPageMatch[1] ?? "");
    const pageId = decodeURIComponent(journalPageMatch[2] ?? "");
    let page: unknown;
    if (services.journals) {
      page = await services.journals.getPage(journalId, pageId);
    } else {
      const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
      try {
        page = await adapterSessions.invoke(
          sourceId,
          GET_JOURNAL_PAGE_CAPABILITY,
          { journalId, pageId },
        );
      } catch (error) {
        if (!(error instanceof AdapterInvocationError)) throw error;
        sendAdapterInvocationError(response, error);
        return;
      }
    }
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
  const adapterSessions = new AdapterSessionRegistry();
  const mcp = createLoreBridgeMcpHandler(adapterSessions);
  const server = createServer((request, response) => {
    void handleRequest(config, identity, pairing, adapterSessions, services, mcp, request, response).catch((error) => {
      console.error("LoreBridge request failed", error);
      if (!response.headersSent) sendJson(response, error instanceof SyntaxError ? 400 : 500, { error: { code: error instanceof SyntaxError ? "invalid_json" : "internal_error", message: "LoreBridge could not process the request." } });
      else response.end();
    });
  });
  server.on("close", () => {
    void mcp.close();
  });
  attachAdapterSessionServer(server, identity.id, pairing, adapterSessions);
  return server;
}
