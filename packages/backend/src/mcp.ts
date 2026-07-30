import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import {
  GET_ACTOR_CAPABILITY,
  GET_JOURNAL_PAGE_CAPABILITY,
  GET_SCENE_CAPABILITY,
  GET_ACTIVE_SCENE_CAPABILITY,
  GET_WORLD_SUMMARY_CAPABILITY,
  RESOLVE_UUID_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  SEARCH_ACTORS_CAPABILITY,
  SEARCH_SCENES_CAPABILITY,
  validateGetActorOutput,
  validateGetJournalPageOutput,
  validateGetSceneOutput,
  validateGetActiveSceneOutput,
  validateGetWorldSummaryOutput,
  validateResolveUuidOutput,
  validateSearchJournalsOutput,
  validateSearchActorsOutput,
  validateSearchScenesOutput,
} from "@lorebridge/shared/capabilities";
import {
  AdapterInvocationError,
  type AdapterSessionRegistry,
} from "./adapter-sessions.js";

const resolveUuidToolName = "resolve_uuid";
const worldSummaryToolName = "get_world_summary";
const journalSearchToolName = "search_journals";
const journalPageToolName = "get_journal_page";
const actorSearchToolName = "search_actors";
const actorToolName = "get_actor";
const sceneSearchToolName = "search_scenes";
const sceneToolName = "get_scene";
const activeSceneToolName = "get_active_scene";

function toolError(error: unknown, fallback: string) {
  return {
    isError: true as const,
    content: [{
      type: "text" as const,
      text: error instanceof Error ? error.message : fallback,
    }],
  };
}

function createServer(adapterSessions: AdapterSessionRegistry): McpServer {
  const server = new McpServer({
    name: "lorebridge",
    version: "0.2.0",
  });

  server.registerTool(
    worldSummaryToolName,
    {
      title: "Get Foundry world summary",
      description: "Return metadata and document counts for a connected Foundry VTT world.",
      inputSchema: z.object({
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sourceId }) => {
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
        return {
          content: [{
            type: "text",
            text: JSON.stringify(validation.value),
          }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(
          error,
          "LoreBridge could not retrieve the Foundry world summary.",
        );
      }
    },
  );

  server.registerTool(
    journalSearchToolName,
    {
      title: "Search Foundry journals",
      description: "Search connected Foundry VTT journal names, page names, and page text. Returns lightweight matches; use focused page retrieval to read a result.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe(
          "Text to find in journal names, page names, or page content.",
        ),
        limit: z.number().int().min(1).max(50).optional().describe(
          "Maximum number of matches to return. Defaults to the adapter limit.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit, sourceId }) => {
      try {
        const input = {
          query,
          ...(limit === undefined ? {} : { limit }),
        };
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_JOURNALS_CAPABILITY,
          input,
        );
        const validation = validateSearchJournalsOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid journal search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify(validation.value),
          }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(
          error,
          "LoreBridge could not search Foundry journals.",
        );
      }
    },
  );

  server.registerTool(
    journalPageToolName,
    {
      title: "Get a Foundry journal page",
      description: "Retrieve one focused journal page from a connected Foundry VTT world. Use journalId and pageId from search_journals results.",
      inputSchema: z.object({
        journalId: z.string().trim().min(1).describe(
          "The Foundry JournalEntry ID returned by search_journals.",
        ),
        pageId: z.string().trim().min(1).describe(
          "The Foundry JournalEntryPage ID returned by search_journals.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ journalId, pageId, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_JOURNAL_PAGE_CAPABILITY,
          { journalId, pageId },
        );
        const validation = validateGetJournalPageOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid journal page.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify(validation.value),
          }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(
          error,
          "LoreBridge could not retrieve the Foundry journal page.",
        );
      }
    },
  );

  server.registerTool(
    actorSearchToolName,
    {
      title: "Search Foundry actors",
      description: "Search connected Foundry VTT world actors by name or description, with optional actor-type filtering. Returns lightweight matches.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Text to find in actor names or descriptions."),
        limit: z.number().int().min(1).max(50).optional(),
        types: z.array(z.string().trim().min(1)).min(1).max(20).optional().describe(
          "Optional Foundry actor types to include, such as npc or character.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit, types, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_ACTORS_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
          },
        );
        const validation = validateSearchActorsOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid actor search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not search Foundry actors.");
      }
    },
  );

  server.registerTool(
    actorToolName,
    {
      title: "Get a Foundry actor",
      description: "Retrieve focused identity and descriptive information for one world actor. Use actorId from search_actors.",
      inputSchema: z.object({
        actorId: z.string().trim().min(1).describe(
          "The Foundry Actor ID or UUID returned by search_actors.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ actorId, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_ACTOR_CAPABILITY,
          { actorId },
        );
        const validation = validateGetActorOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid actor.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not retrieve the Foundry actor.");
      }
    },
  );

  server.registerTool(
    sceneSearchToolName,
    {
      title: "Search Foundry scenes",
      description: "Search connected Foundry VTT world scenes by name. Returns lightweight matches including active and navigation state.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Text to find in scene names."),
        limit: z.number().int().min(1).max(50).optional(),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_SCENES_CAPABILITY,
          { query, ...(limit === undefined ? {} : { limit }) },
        );
        const validation = validateSearchScenesOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid scene search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not search Foundry scenes.");
      }
    },
  );

  server.registerTool(
    sceneToolName,
    {
      title: "Get a Foundry scene",
      description: "Retrieve focused metadata for one world scene, including dimensions, navigation state, linked journal, and bounded token and map-note summaries. Use sceneId from search_scenes.",
      inputSchema: z.object({
        sceneId: z.string().trim().min(1).describe(
          "The Foundry Scene ID or UUID returned by search_scenes.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sceneId, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_SCENE_CAPABILITY,
          { sceneId },
        );
        const validation = validateGetSceneOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid scene.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not retrieve the Foundry scene.");
      }
    },
  );

  server.registerTool(
    activeSceneToolName,
    {
      title: "Get the active Foundry scene",
      description: "Retrieve the scene currently active in the GM's Foundry session, including its name, UUID, dimensions, linked journal, and bounded token and map-note summaries. Returns an error if no scene is active.",
      inputSchema: z.object({
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_ACTIVE_SCENE_CAPABILITY,
          {},
        );
        const validation = validateGetActiveSceneOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid active scene.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not retrieve the active Foundry scene.");
      }
    },
  );

  server.registerTool(
    resolveUuidToolName,
    {
      title: "Resolve a Foundry UUID link",
      description: "Resolve a Foundry VTT UUID to its full document. Use this to follow @UUID[...] links embedded in journal text, scene notes, or actor descriptions. Supports Actor, JournalEntry, JournalEntryPage, and Scene UUIDs.",
      inputSchema: z.object({
        uuid: z.string().trim().min(1).describe(
          "A Foundry VTT UUID string such as Actor.abc123, JournalEntry.abc123, JournalEntry.abc123.JournalEntryPage.def456, or Scene.abc123.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ uuid, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          RESOLVE_UUID_CAPABILITY,
          { uuid },
        );
        const validation = validateResolveUuidOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid resolved document.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not resolve the Foundry UUID.");
      }
    },
  );

  return server;
}

export interface McpRequestHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
  close(): Promise<void>;
}

export function createLoreBridgeMcpHandler(
  adapterSessions: AdapterSessionRegistry,
): McpRequestHandler {
  const handler = createMcpHandler(
    () => createServer(adapterSessions),
    {
      legacy: "stateless",
      onerror: (error) => console.error("LoreBridge MCP request failed", error),
    },
  );
  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => console.error("LoreBridge MCP transport failed", error),
  });

  return {
    handle: (request, response) => nodeHandler(
      request as Parameters<typeof nodeHandler>[0],
      response,
    ),
    close: () => handler.close(),
  };
}
