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
  GET_RELATED_DOCUMENTS_CAPABILITY,
  RESOLVE_UUID_CAPABILITY,
  SEARCH_CAMPAIGN_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  SEARCH_ACTORS_CAPABILITY,
  SEARCH_SCENES_CAPABILITY,
  SEARCH_ITEMS_CAPABILITY,
  GET_ACTOR_INVENTORY_CAPABILITY,
  validateGetActorOutput,
  validateGetJournalPageOutput,
  validateGetSceneOutput,
  validateGetActiveSceneOutput,
  validateGetWorldSummaryOutput,
  validateGetRelatedDocumentsOutput,
  validateResolveUuidOutput,
  validateSearchCampaignOutput,
  validateSearchJournalsOutput,
  validateSearchActorsOutput,
  validateSearchScenesOutput,
  validateSearchItemsOutput,
  validateGetActorInventoryOutput,
} from "@lorebridge/shared/capabilities";
import {
  AdapterInvocationError,
  type AdapterSessionRegistry,
} from "./adapter-sessions.js";

const relatedDocumentsToolName = "get_related_documents";
const searchCampaignToolName = "search_campaign";
const searchItemsToolName = "search_items";
const actorInventoryToolName = "get_actor_inventory";
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
    searchCampaignToolName,
    {
      title: "Search the Foundry campaign",
      description: "Search journals, actors, and scenes in a connected Foundry VTT world through a single ranked request. Returns typed, source-attributed results. Use the focused per-document tools to retrieve full content after finding a match.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe(
          "Text to find across journal names, page names, page content, actor names, actor descriptions, and scene names.",
        ),
        limit: z.number().int().min(1).max(50).optional().describe(
          "Maximum total results to return across all document types. Defaults to 20.",
        ),
        types: z.array(z.enum(["journal", "actor", "scene"])).min(1).max(3).optional().describe(
          "Document types to include. Defaults to all: journal, actor, scene.",
        ),
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns all documents. 'player' filters to documents visible to players (OBSERVER permission or higher).",
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
    async ({ query, limit, types, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_CAMPAIGN_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
            ...(mode === undefined ? {} : { mode }),
          },
        );
        const validation = validateSearchCampaignOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid campaign search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not search the Foundry campaign.");
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
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns all journals. 'player' filters to journals visible to players.",
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
    async ({ query, limit, mode, sourceId }) => {
      try {
        const input = {
          query,
          ...(limit === undefined ? {} : { limit }),
          ...(mode === undefined ? {} : { mode }),
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
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns the page regardless of permissions. 'player' returns NOT_FOUND for GM-only journals.",
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
    async ({ journalId, pageId, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_JOURNAL_PAGE_CAPABILITY,
          { journalId, pageId, ...(mode === undefined ? {} : { mode }) },
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
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns all actors. 'player' filters to actors visible to players.",
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
    async ({ query, limit, types, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_ACTORS_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
            ...(mode === undefined ? {} : { mode }),
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
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns the actor regardless of permissions. 'player' returns NOT_FOUND for GM-only actors.",
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
    async ({ actorId, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_ACTOR_CAPABILITY,
          { actorId, ...(mode === undefined ? {} : { mode }) },
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
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns all scenes. 'player' filters to scenes visible to players.",
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
    async ({ query, limit, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_SCENES_CAPABILITY,
          { query, ...(limit === undefined ? {} : { limit }), ...(mode === undefined ? {} : { mode }) },
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
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns the scene regardless of permissions. 'player' returns NOT_FOUND for GM-only scenes.",
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
    async ({ sceneId, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_SCENE_CAPABILITY,
          { sceneId, ...(mode === undefined ? {} : { mode }) },
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

  server.registerTool(
    relatedDocumentsToolName,
    {
      title: "Get related Foundry documents",
      description: "Starting from a Foundry VTT UUID, return directly related documents one hop away. Follows explicit @UUID links in journal and actor HTML, scene-linked journals, map-note journal pins, and placed actor tokens. Use this to discover connected campaign content without a full-world search.",
      inputSchema: z.object({
        uuid: z.string().trim().min(1).describe(
          "A Foundry VTT UUID to start from, such as Actor.abc123, JournalEntry.abc123, JournalEntry.abc123.JournalEntryPage.def456, or Scene.abc123.",
        ),
        limit: z.number().int().min(1).max(50).optional().describe(
          "Maximum number of related documents to return. Defaults to 20.",
        ),
        types: z.array(z.enum(["actor", "journal", "journalPage", "scene"])).min(1).max(4).optional().describe(
          "Document types to include in results. Defaults to all: actor, journal, journalPage, scene.",
        ),
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns all related documents. 'player' filters related documents to those visible to players.",
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
    async ({ uuid, limit, types, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_RELATED_DOCUMENTS_CAPABILITY,
          {
            uuid,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
            ...(mode === undefined ? {} : { mode }),
          },
        );
        const validation = validateGetRelatedDocumentsOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid related documents.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not retrieve related documents.");
      }
    },
  );

  server.registerTool(
    searchItemsToolName,
    {
      title: "Search Foundry world items",
      description: "Search world-level items in a connected Foundry VTT world by name or description, with optional item-type filtering. Returns lightweight matches; use get_actor_inventory to retrieve items owned by a specific actor.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Text to find in item names or descriptions."),
        limit: z.number().int().min(1).max(50).optional(),
        types: z.array(z.string().trim().min(1)).min(1).max(20).optional().describe(
          "Optional Foundry item types to include, such as weapon, equipment, or consumable.",
        ),
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns all items. 'player' filters to items visible to players.",
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
    async ({ query, limit, types, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_ITEMS_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
            ...(mode === undefined ? {} : { mode }),
          },
        );
        const validation = validateSearchItemsOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid item search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not search Foundry items.");
      }
    },
  );

  server.registerTool(
    actorInventoryToolName,
    {
      title: "Get a Foundry actor's inventory",
      description: "Retrieve the bounded item list embedded in a specific Foundry VTT actor. Returns each item's name, type, quantity, weight, price, rarity, and identified state. Use actorId from search_actors or search_campaign.",
      inputSchema: z.object({
        actorId: z.string().trim().min(1).describe(
          "The Foundry Actor ID or UUID returned by search_actors or search_campaign.",
        ),
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns the inventory regardless of permissions. 'player' returns NOT_FOUND for GM-only actors.",
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
    async ({ actorId, mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_ACTOR_INVENTORY_CAPABILITY,
          { actorId, ...(mode === undefined ? {} : { mode }) },
        );
        const validation = validateGetActorInventoryOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid actor inventory.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not retrieve the Foundry actor inventory.");
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
