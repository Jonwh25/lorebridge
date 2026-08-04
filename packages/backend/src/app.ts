import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  GET_ACTOR_CAPABILITY,
  GET_JOURNAL_PAGE_CAPABILITY,
  GET_SCENE_CAPABILITY,
  GET_ACTIVE_SCENE_CAPABILITY,
  GET_WORLD_SUMMARY_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  SEARCH_ACTORS_CAPABILITY,
  SEARCH_SCENES_CAPABILITY,
  validateGenerateBoxedTextInput,
  validateGenerateBoxedTextOutput,
  validateGetActorOutput,
  validateGetSceneOutput,
  validateGetActiveSceneOutput,
  validateGetWorldSummaryOutput,
  validateGetJournalOutput,
  validateGetJournalPageOutput,
  validateSearchJournalsInput,
  validateSearchJournalsOutput,
  validateSearchActorsInput,
  validateSearchActorsOutput,
  validateSearchScenesInput,
  validateSearchScenesOutput,
  validateBackupExportInput,
  type BackupExportOutput,
} from "@lorebridge/shared/capabilities";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import type { BackendServices } from "./journal-service.js";
import { PairingService } from "./pairing.js";
import { ProviderService } from "./provider.js";
import { generateBoxedText, generateChatAnswer, generateNpcProfile, generateSessionRecap, generateEncounterSuggestions, generateJournalAnswer, generateRoleplayResponse, generateSessionPrep, generateCityDescription, generateNpcCast, GenerationError } from "./generation.js";
import {
  AdapterInvocationError,
  AdapterSessionRegistry,
  attachAdapterSessionServer,
} from "./adapter-sessions.js";
import {
  createLoreBridgeMcpHandler,
  type McpRequestHandler,
} from "./mcp.js";
import { WriteRegistry, WriteTokenError } from "./write-registry.js";
import { AssetSearchService } from "./asset-search.js";
import { createGitHubAdapter, GitHubAdapterError, resolveCampaignPath, type GitHubAdapter } from "./github-adapter.js";

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

async function handleRequest(config: BackendConfig, identity: BackendIdentity, pairing: PairingService, adapterSessions: AdapterSessionRegistry, services: BackendServices, provider: ProviderService, mcp: McpRequestHandler, writes: WriteRegistry, github: GitHubAdapter | null, request: IncomingMessage, response: ServerResponse): Promise<void> {
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
      if (adapterSessions.hasCapability(SEARCH_SCENES_CAPABILITY)) capabilities.push("searchScenes");
      if (adapterSessions.hasCapability(GET_SCENE_CAPABILITY)) capabilities.push("getScene");
      if (adapterSessions.hasCapability(GET_ACTIVE_SCENE_CAPABILITY)) capabilities.push("getActiveScene");
    }
    if (github) capabilities.push("backup/github");
    sendJson(response, 200, { service: "lorebridge-backend", version: serviceVersion, protocolVersion: "0.1", capabilities, providerEnabled: provider.enabled });
    return;
  }

  if (method === "GET" && url.pathname === "/v1/provider/status") {
    if (!authenticate(pairing, request, response)) return;
    const healthy = provider.enabled ? await provider.validate() : null;
    sendJson(response, 200, provider.status(healthy));
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

  if (method === "POST" && url.pathname === "/v1/scenes/search") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const validation = validateSearchScenesInput(body);
    if (!validation.valid || !validation.value) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Scene search input is invalid.", details: validation.errors } });
      return;
    }
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    try {
      const result = await adapterSessions.invoke(sourceId, SEARCH_SCENES_CAPABILITY, validation.value);
      const outputValidation = validateSearchScenesOutput(result);
      if (!outputValidation.valid || !outputValidation.value) {
        throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned invalid scene search results.", false, { validationErrors: outputValidation.errors });
      }
      sendJson(response, 200, outputValidation.value);
    } catch (error) {
      if (!(error instanceof AdapterInvocationError)) throw error;
      sendAdapterInvocationError(response, error);
    }
    return;
  }

  if (method === "GET" && url.pathname === "/v1/scenes/active") {
    if (!authenticate(pairing, request, response)) return;
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    try {
      const result = await adapterSessions.invoke(sourceId, GET_ACTIVE_SCENE_CAPABILITY, {});
      const outputValidation = validateGetActiveSceneOutput(result);
      if (!outputValidation.valid || !outputValidation.value) {
        throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned an invalid active scene.", false, { validationErrors: outputValidation.errors });
      }
      sendJson(response, 200, outputValidation.value);
    } catch (error) {
      if (!(error instanceof AdapterInvocationError)) throw error;
      sendAdapterInvocationError(response, error);
    }
    return;
  }

  const sceneMatch = method === "GET" ? url.pathname.match(/^\/v1\/scenes\/([^/]+)$/) : null;
  if (sceneMatch) {
    if (!authenticate(pairing, request, response)) return;
    const sceneId = decodeURIComponent(sceneMatch[1] ?? "");
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
    try {
      const result = await adapterSessions.invoke(sourceId, GET_SCENE_CAPABILITY, { sceneId });
      const outputValidation = validateGetSceneOutput(result);
      if (!outputValidation.valid || !outputValidation.value) {
        throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned an invalid scene.", false, { validationErrors: outputValidation.errors });
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

  if (method === "POST" && url.pathname === "/v1/generate/boxed-text") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const validation = validateGenerateBoxedTextInput(body);
    if (!validation.valid || !validation.value) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Boxed text generation input is invalid.", details: validation.errors } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateBoxedText(provider, validation.value);
      const outputValidation = validateGenerateBoxedTextOutput(result);
      if (!outputValidation.valid || !outputValidation.value) {
        throw new Error(`Generation returned invalid output: ${outputValidation.errors.join(", ")}`);
      }
      sendJson(response, 200, outputValidation.value);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/write/reject") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const token = typeof body["token"] === "string" ? body["token"].trim() : "";
    if (!token) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty token string." } });
      return;
    }
    try {
      writes.reject(token);
      sendJson(response, 200, { rejected: true });
    } catch (error) {
      if (error instanceof WriteTokenError) {
        const status = error.reason === "not_found" ? 404 : 410;
        sendJson(response, status, { error: { code: `write_token_${error.reason}`, message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/write/approve") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const token = typeof body["token"] === "string" ? body["token"].trim() : "";
    if (!token) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty token string." } });
      return;
    }
    try {
      const entry = writes.consume(token);
      sendJson(response, 200, {
        journalId: entry.journalId,
        pageId: entry.pageId,
        pageName: entry.pageName,
        proposedContent: entry.proposedContent,
      });
    } catch (error) {
      if (error instanceof WriteTokenError) {
        const status = error.reason === "not_found" ? 404 : 410;
        sendJson(response, status, { error: { code: `write_token_${error.reason}`, message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/chat/ask") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const question = typeof body["question"] === "string" ? body["question"].trim() : "";
    const worldName = typeof body["worldName"] === "string" ? body["worldName"] : "Unknown World";
    const context = Array.isArray(body["context"]) ? body["context"] as Array<{ type: string; name: string; excerpt: string }> : [];
    if (!question) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty question string." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateChatAnswer(provider, { question, context, worldName });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/npc-profile") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    const type = typeof body["type"] === "string" ? body["type"].trim() : "npc";
    const biography = typeof body["biography"] === "string" ? body["biography"] : "";
    const tone = typeof body["tone"] === "string" ? body["tone"] : "neutral";
    if (!name) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty name string." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateNpcProfile(provider, { name, type, biography, tone });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/session-recap") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const sessionContent = typeof body["sessionContent"] === "string" ? body["sessionContent"].trim() : "";
    const sessionName = typeof body["sessionName"] === "string" ? body["sessionName"] : "Session";
    const tone = typeof body["tone"] === "string" ? body["tone"] : "neutral";
    const length = typeof body["length"] === "string" ? body["length"] : "medium";
    if (!sessionContent) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include non-empty sessionContent." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateSessionRecap(provider, { sessionContent, sessionName, tone, length });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/encounter-suggestions") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const sceneName = typeof body["sceneName"] === "string" ? body["sceneName"].trim() : "";
    const linkedJournal = typeof body["linkedJournal"] === "string" ? body["linkedJournal"] : undefined;
    const tokens = Array.isArray(body["tokens"]) ? (body["tokens"] as unknown[]).filter(t => typeof t === "string") as string[] : [];
    const tone = typeof body["tone"] === "string" ? body["tone"] : "neutral";
    if (!sceneName) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty sceneName string." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateEncounterSuggestions(provider, { sceneName, ...(linkedJournal !== undefined && { linkedJournal }), tokens, tone });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/journal-qa") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const question = typeof body["question"] === "string" ? body["question"].trim() : "";
    const pageContent = typeof body["pageContent"] === "string" ? body["pageContent"] : "";
    const pageName = typeof body["pageName"] === "string" ? body["pageName"] : "Page";
    const journalName = typeof body["journalName"] === "string" ? body["journalName"] : "Journal";
    if (!question) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty question string." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateJournalAnswer(provider, { question, pageContent, pageName, journalName });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/roleplay") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const actorName = typeof body["actorName"] === "string" ? body["actorName"].trim() : "";
    const biography = typeof body["biography"] === "string" ? body["biography"] : "";
    const personality = typeof body["personality"] === "string" ? body["personality"] : "";
    const message = typeof body["message"] === "string" ? body["message"].trim() : "";
    const history = Array.isArray(body["history"]) ? body["history"] as Array<{ role: "user" | "assistant"; content: string }> : [];
    if (!actorName || !message) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include actorName and message strings." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateRoleplayResponse(provider, { actorName, biography, personality, history, message });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/session-prep") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const sessionName = typeof body["sessionName"] === "string" ? body["sessionName"].trim() : "";
    const sessionContent = typeof body["sessionContent"] === "string" ? body["sessionContent"] : "";
    const worldName = typeof body["worldName"] === "string" ? body["worldName"] : "Unknown World";
    const tone = typeof body["tone"] === "string" ? body["tone"] : "neutral";
    const context = Array.isArray(body["context"])
      ? (body["context"] as unknown[]).filter(
          (c): c is { type: string; name: string; excerpt: string } =>
            typeof c === "object" && c !== null &&
            typeof (c as Record<string, unknown>)["type"] === "string" &&
            typeof (c as Record<string, unknown>)["name"] === "string" &&
            typeof (c as Record<string, unknown>)["excerpt"] === "string",
        )
      : [];
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateSessionPrep(provider, { sessionName, sessionContent, worldName, tone, context });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/city") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const description = typeof body["description"] === "string" ? body["description"].trim() : "";
    const worldName = typeof body["worldName"] === "string" ? body["worldName"] : "Unknown World";
    const tone = typeof body["tone"] === "string" ? body["tone"] : "neutral";
    const context = Array.isArray(body["context"])
      ? (body["context"] as unknown[]).filter(
          (c): c is { type: string; name: string; excerpt: string } =>
            typeof c === "object" && c !== null &&
            typeof (c as Record<string, unknown>)["type"] === "string" &&
            typeof (c as Record<string, unknown>)["name"] === "string" &&
            typeof (c as Record<string, unknown>)["excerpt"] === "string",
        )
      : [];
    if (!description) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty description string." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateCityDescription(provider, { description, worldName, tone, context });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/generate/npcs") {
    if (!authenticate(pairing, request, response)) return;
    const body = await readJson(request);
    const locationDescription = typeof body["locationDescription"] === "string" ? body["locationDescription"].trim() : "";
    const count = typeof body["count"] === "number" && body["count"] > 0 ? Math.min(body["count"], 10) : 5;
    const worldName = typeof body["worldName"] === "string" ? body["worldName"] : "Unknown World";
    const tone = typeof body["tone"] === "string" ? body["tone"] : "neutral";
    const context = Array.isArray(body["context"])
      ? (body["context"] as unknown[]).filter(
          (c): c is { type: string; name: string; excerpt: string } =>
            typeof c === "object" && c !== null &&
            typeof (c as Record<string, unknown>)["type"] === "string" &&
            typeof (c as Record<string, unknown>)["name"] === "string" &&
            typeof (c as Record<string, unknown>)["excerpt"] === "string",
        )
      : [];
    if (!locationDescription) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Request body must include a non-empty locationDescription string." } });
      return;
    }
    if (!provider.enabled) {
      sendJson(response, 503, { error: { code: "provider_unavailable", message: "No AI provider is configured on this backend." } });
      return;
    }
    try {
      const result = await generateNpcCast(provider, { locationDescription, count, worldName, tone, context });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        sendJson(response, 502, { error: { code: "generation_failed", message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && url.pathname === "/v1/backup/github/status") {
    if (!authenticate(pairing, request, response)) return;
    if (!github) {
      sendJson(response, 503, { error: { code: "not_configured", message: "GitHub backup is not configured on this backend." } });
      return;
    }
    try {
      const info = await github.verifyAccess();
      sendJson(response, 200, {
        configured: true,
        owner: github.owner,
        repo: github.repo,
        branch: github.branch,
        campaignRoot: github.campaignRoot,
        repoName: info.name,
        repoFullName: info.fullName,
        isPrivate: info.isPrivate,
        defaultBranch: info.defaultBranch,
      });
    } catch (error) {
      if (error instanceof GitHubAdapterError) {
        const status = error.code === "access_denied" ? 403
          : error.code === "not_found" ? 404
          : error.code === "rate_limited" ? 429
          : 502;
        sendJson(response, status, { error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && url.pathname === "/v1/backup/github/commits") {
    if (!authenticate(pairing, request, response)) return;
    if (!github) {
      sendJson(response, 503, { error: { code: "not_configured", message: "GitHub backup is not configured on this backend." } });
      return;
    }
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 10), 20) : 10;
    try {
      const commits = await github.listCommits(limit);
      sendJson(response, 200, { commits });
    } catch (error) {
      if (error instanceof GitHubAdapterError) {
        const status = error.code === "access_denied" ? 403
          : error.code === "rate_limited" ? 429
          : 502;
        sendJson(response, status, { error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "GET" && url.pathname === "/v1/backup/github/file") {
    if (!authenticate(pairing, request, response)) return;
    if (!github) {
      sendJson(response, 503, { error: { code: "not_configured", message: "GitHub backup is not configured on this backend." } });
      return;
    }
    const filePath = url.searchParams.get("path");
    if (!filePath || !filePath.trim()) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "The 'path' query parameter is required." } });
      return;
    }
    const ref = url.searchParams.get("ref") ?? undefined;
    try {
      const content = ref
        ? await github.readFileAtRef(filePath, ref)
        : await github.readFile(filePath);
      sendJson(response, 200, { path: filePath, ref: ref ?? github.branch, content });
    } catch (error) {
      if (error instanceof GitHubAdapterError) {
        const status = error.code === "access_denied" ? 403
          : error.code === "not_found" ? 404
          : error.code === "rate_limited" ? 429
          : 502;
        sendJson(response, status, { error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/backup/github/export") {
    if (!authenticate(pairing, request, response)) return;
    // Validate input before checking GitHub config so clients get actionable 400s.
    const body = await readJson(request);
    const validation = validateBackupExportInput(body);
    if (!validation.valid || !validation.value) {
      sendJson(response, 400, { error: { code: "invalid_request", message: "Backup export input is invalid.", details: validation.errors } });
      return;
    }
    const input = validation.value;
    if (!github) {
      sendJson(response, 503, { error: { code: "not_configured", message: "GitHub backup is not configured on this backend." } });
      return;
    }

    // Validate all paths against the campaign root before doing anything.
    try {
      for (const file of input.files) {
        resolveCampaignPath(github.campaignRoot, file.path);
      }
    } catch (error) {
      if (error instanceof GitHubAdapterError) {
        sendJson(response, 400, { error: { code: "invalid_path", message: error.message } });
        return;
      }
      throw error;
    }

    if (input.preview) {
      const output: BackupExportOutput = {
        preview: true,
        type: input.type,
        folderName: input.folderName,
        files: input.files,
        warnings: [],
      };
      sendJson(response, 200, output);
      return;
    }

    // Commit to GitHub.
    const defaultMessage = `LoreBridge backup: ${input.type} folder "${input.folderName}"`;
    const commitMessage = input.commitMessage?.trim() || defaultMessage;
    try {
      const result = await github.createBackupCommit(
        commitMessage,
        input.files.map((f) => ({ path: f.path, content: f.content })),
      );
      const output: BackupExportOutput = {
        preview: false,
        type: input.type,
        folderName: input.folderName,
        files: input.files,
        commitSha: result.sha,
        commitUrl: result.url,
        warnings: [],
      };
      sendJson(response, 200, output);
    } catch (error) {
      if (error instanceof GitHubAdapterError) {
        const status =
          error.code === "access_denied" ? 403
          : error.code === "not_found" ? 404
          : error.code === "conflict" ? 409
          : error.code === "rate_limited" ? 429
          : 502;
        sendJson(response, status, { error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
    return;
  }

  sendJson(response, 404, { error: { code: "route_not_found", message: "The requested LoreBridge route does not exist." } });
}

export function createLoreBridgeServer(config: BackendConfig, identity: BackendIdentity, services: BackendServices = {}): Server {
  const pairing = new PairingService(identity, config.pairingTtlSeconds);
  const adapterSessions = new AdapterSessionRegistry();
  const provider = new ProviderService();
  const writes = new WriteRegistry();
  const github = createGitHubAdapter(config.github);
  const mcp = createLoreBridgeMcpHandler(adapterSessions, writes, provider, new AssetSearchService(config.foundryDataDir), github);
  const server = createServer((request, response) => {
    void handleRequest(config, identity, pairing, adapterSessions, services, provider, mcp, writes, github, request, response).catch((error) => {
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
