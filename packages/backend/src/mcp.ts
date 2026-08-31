import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import {
  GET_ACTOR_CAPABILITY,
  GET_JOURNAL_PAGE_CAPABILITY,
  GET_SCENE_CAPABILITY,
  GET_ACTIVE_SCENE_CAPABILITY,
  GET_COMBAT_STATE_CAPABILITY,
  PROPOSE_COMBAT_WRITE_CAPABILITY,
  COMBAT_WRITE_NEXT_TURN_ACTION,
  COMBAT_WRITE_SET_INITIATIVE_ACTION,
  COMBAT_WRITE_END_COMBAT_ACTION,
  COMBAT_WRITE_INITIATIVE_MIN,
  COMBAT_WRITE_INITIATIVE_MAX,
  ROLL_DICE_CAPABILITY,
  GET_CHAT_MESSAGES_CAPABILITY,
  SEARCH_ASSETS_CAPABILITY,
  GET_WORLD_SUMMARY_CAPABILITY,
  GET_RELATED_DOCUMENTS_CAPABILITY,
  RESOLVE_UUID_CAPABILITY,
  SEARCH_CAMPAIGN_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  SEARCH_ACTORS_CAPABILITY,
  SEARCH_SCENES_CAPABILITY,
  SEARCH_ITEMS_CAPABILITY,
  GET_ACTOR_INVENTORY_CAPABILITY,
  SEARCH_SESSION_LOGS_CAPABILITY,
  GET_SESSION_LOG_CAPABILITY,
  LIST_COMPENDIUMS_CAPABILITY,
  SEARCH_COMPENDIUM_CAPABILITY,
  GET_COMPENDIUM_ENTRY_CAPABILITY,
  LIST_MACRO_TOOLS_CAPABILITY,
  EXECUTE_MACRO_TOOL_CAPABILITY,
  LIST_MACROS_CAPABILITY,
  validateListMacroToolsOutput,
  validateListMacrosOutput,
  validateExecuteMacroToolOutput,
  validateCheckCampaignHealthOutput,
  CHECK_CAMPAIGN_HEALTH_CAPABILITY,
  ALL_HEALTH_CHECK_CATEGORIES,
  HEALTH_CHECK_MAX_LIMIT,
  validateAuditCampaignConsistencyOutput,
  AUDIT_CAMPAIGN_CONSISTENCY_CAPABILITY,
  ALL_CONSISTENCY_FINDING_CATEGORIES,
  CONSISTENCY_AUDIT_MAX_LIMIT,
  validateGetActorOutput,
  validateGetJournalPageOutput,
  validateGetSceneOutput,
  validateGetActiveSceneOutput,
  validateGetCombatStateOutput,
  validateCombatWriteProposalResult,
  validateRollDiceOutput,
  validateGetChatMessagesOutput,
  validateSearchAssetsOutput,
  validateGetWorldSummaryOutput,
  validateGetRelatedDocumentsOutput,
  validateResolveUuidOutput,
  validateSearchCampaignOutput,
  validateSearchJournalsOutput,
  validateSearchActorsOutput,
  validateSearchScenesOutput,
  validateSearchItemsOutput,
  validateGetActorInventoryOutput,
  validateSearchSessionLogsOutput,
  validateGetSessionLogOutput,
  validateListCompendiumsOutput,
  validateSearchCompendiumOutput,
  validateGetCompendiumEntryOutput,
  SEARCH_ROLL_TABLES_CAPABILITY,
  validateSearchRollTablesOutput,
  LIST_PLAYLISTS_CAPABILITY,
  SEARCH_PLAYLISTS_CAPABILITY,
  validateListPlaylistsOutput,
  validateSearchPlaylistsOutput,
} from "@lorebridge/shared/capabilities";
import {
  AdapterInvocationError,
  type AdapterSessionRegistry,
} from "./adapter-sessions.js";
import { type WriteRegistry } from "./write-registry.js";
import { type ProviderService } from "./provider.js";
import { generateRollTable, GenerationError } from "./generation.js";
import { LOREBRIDGE_EVENTS } from "@lorebridge/shared";
import { AssetSearchService } from "./asset-search.js";
import { type GitHubAdapter } from "./github-adapter.js";

const relatedDocumentsToolName = "get_related_documents";
const searchCampaignToolName = "search_campaign";
const searchItemsToolName = "search_items";
const actorInventoryToolName = "get_actor_inventory";
const searchSessionLogsToolName = "search_session_logs";
const getSessionLogToolName = "get_session_log";
const resolveUuidToolName = "resolve_uuid";
const worldSummaryToolName = "get_world_summary";
const journalSearchToolName = "search_journals";
const journalPageToolName = "get_journal_page";
const actorSearchToolName = "search_actors";
const actorToolName = "get_actor";
const sceneSearchToolName = "search_scenes";
const sceneToolName = "get_scene";
const activeSceneToolName = "get_active_scene";
const combatStateToolName = "get_combat_state";
const nextTurnToolName = "next_turn";
const setInitiativeToolName = "set_initiative";
const endCombatToolName = "end_combat";
const rollDiceToolName = "roll_dice";
const chatMessagesToolName = "get_chat_messages";
const searchAssetsToolName = "search_assets";
const searchRollTablesToolName = "search_roll_tables";
const listPlaylistsToolName = "list_playlists";
const searchPlaylistsToolName = "search_playlists";

function toolError(error: unknown, fallback: string) {
  return {
    isError: true as const,
    content: [{
      type: "text" as const,
      text: error instanceof Error ? error.message : fallback,
    }],
  };
}

function createServer(adapterSessions: AdapterSessionRegistry, writes: WriteRegistry, provider: ProviderService, assets: AssetSearchService, github: GitHubAdapter | null): McpServer {
  const server = new McpServer({
    name: "lorebridge",
    version: "0.2.0",
  });

  server.registerTool(
    endCombatToolName,
    {
      title: "End the active combat",
      description: "Propose ending only the connected Foundry world's active, started combat. The GM receives the encounter, scene, round, turn, and roster-size preview, then must complete a distinct destructive confirmation before LoreBridge calls Foundry's public Combat.endCombat() API.",
      inputSchema: z.object({
        rationale: z.string().trim().min(1).max(500).describe("Why the active combat should end. This is shown to the GM."),
        sourceId: z.string().trim().min(1).optional().describe("LoreBridge source identifier. Omit when exactly one compatible Foundry world is connected."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ rationale, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, PROPOSE_COMBAT_WRITE_CAPABILITY, { action: COMBAT_WRITE_END_COMBAT_ACTION, rationale });
        const validation = validateCombatWriteProposalResult(result);
        if (!validation.valid || !validation.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned an invalid end-combat proposal.", false, { validationErrors: validation.errors });
        return { content: [{ type: "text", text: JSON.stringify(validation.value) }], structuredContent: validation.value };
      } catch (error) { return toolError(error, "LoreBridge could not propose ending the active combat."); }
    },
  );

  server.registerTool(
    nextTurnToolName,
    {
      title: "Advance the active combat to the next turn",
      description: "Propose advancing the connected Foundry world's active, started combat by exactly one turn. The active GM receives a current/next combatant and round-transition preview and must explicitly approve it before any combat state changes.",
      inputSchema: z.object({
        rationale: z.string().trim().min(1).max(500).describe("Why the active combat should advance. This is shown to the GM in the approval preview."),
        sourceId: z.string().trim().min(1).optional().describe("LoreBridge source identifier. Omit when exactly one compatible Foundry world is connected."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ rationale, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, PROPOSE_COMBAT_WRITE_CAPABILITY, { action: COMBAT_WRITE_NEXT_TURN_ACTION, rationale });
        const validation = validateCombatWriteProposalResult(result);
        if (!validation.valid || !validation.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned an invalid next-turn proposal.", false, { validationErrors: validation.errors });
        return { content: [{ type: "text", text: JSON.stringify(validation.value) }], structuredContent: validation.value };
      } catch (error) {
        return toolError(error, "LoreBridge could not propose advancing the active combat.");
      }
    },
  );

  server.registerTool(
    setInitiativeToolName,
    {
      title: "Set one combatant's initiative",
      description: "Propose assigning one bounded initiative value to one combatant in the active, started Foundry combat. The GM receives an old/new value and expected-position preview and must explicitly approve it before any combat state changes.",
      inputSchema: z.object({
        combatantId: z.string().trim().min(1).describe("Stable combatant ID from get_combat_state."),
        initiative: z.number().finite().min(COMBAT_WRITE_INITIATIVE_MIN).max(COMBAT_WRITE_INITIATIVE_MAX).describe(`New initiative value between ${COMBAT_WRITE_INITIATIVE_MIN} and ${COMBAT_WRITE_INITIATIVE_MAX}.`),
        rationale: z.string().trim().min(1).max(500).describe("Why this combatant's initiative should change. This is shown to the GM."),
        sourceId: z.string().trim().min(1).optional().describe("LoreBridge source identifier. Omit when exactly one compatible Foundry world is connected."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ combatantId, initiative, rationale, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, PROPOSE_COMBAT_WRITE_CAPABILITY, { action: COMBAT_WRITE_SET_INITIATIVE_ACTION, combatantId, initiative, rationale });
        const validation = validateCombatWriteProposalResult(result);
        if (!validation.valid || !validation.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned an invalid initiative proposal.", false, { validationErrors: validation.errors });
        return { content: [{ type: "text", text: JSON.stringify(validation.value) }], structuredContent: validation.value };
      } catch (error) {
        return toolError(error, "LoreBridge could not propose setting combatant initiative.");
      }
    },
  );

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
        folderId: z.string().trim().min(1).optional().describe(
          "Optional Foundry folder ID to restrict results to documents in that folder.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
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
    async ({ query, limit, types, mode, folderId, excludeFolderIds, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_CAMPAIGN_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
            ...(mode === undefined ? {} : { mode }),
            ...(folderId === undefined ? {} : { folderId }),
            ...(excludeFolderIds === undefined ? {} : { excludeFolderIds }),
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
        folderId: z.string().trim().min(1).optional().describe(
          "Optional Foundry folder ID to restrict results to journals in that folder.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
        ),
        journalId: z.string().trim().min(1).optional().describe(
          "Optional Foundry JournalEntry ID or UUID to restrict the search to entries within a single journal.",
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
    async ({ query, limit, mode, folderId, excludeFolderIds, journalId, sourceId }) => {
      try {
        const input = {
          query,
          ...(limit === undefined ? {} : { limit }),
          ...(mode === undefined ? {} : { mode }),
          ...(folderId === undefined ? {} : { folderId }),
          ...(excludeFolderIds === undefined ? {} : { excludeFolderIds }),
          ...(journalId === undefined ? {} : { journalId }),
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
        folderId: z.string().trim().min(1).optional().describe(
          "Optional Foundry folder ID to restrict results to actors in that folder.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
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
    async ({ query, limit, types, mode, folderId, excludeFolderIds, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_ACTORS_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
            ...(mode === undefined ? {} : { mode }),
            ...(folderId === undefined ? {} : { folderId }),
            ...(excludeFolderIds === undefined ? {} : { excludeFolderIds }),
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
        folderId: z.string().trim().min(1).optional().describe(
          "Optional Foundry folder ID to restrict results to scenes in that folder.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
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
    async ({ query, limit, mode, folderId, excludeFolderIds, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_SCENES_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(mode === undefined ? {} : { mode }),
            ...(folderId === undefined ? {} : { folderId }),
            ...(excludeFolderIds === undefined ? {} : { excludeFolderIds }),
          },
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
    combatStateToolName,
    {
      title: "Get Foundry combat state",
      description: "Retrieve the active Foundry combat encounter's round, current turn, and bounded initiative order. GM mode includes normalized hit points; player mode omits hidden combatants and hit points.",
      inputSchema: z.object({
        mode: z.enum(["gm", "player"]).optional().describe("Visibility mode. 'gm' (default) includes normalized HP. 'player' omits hidden combatants and HP."),
        sourceId: z.string().trim().min(1).optional().describe("LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected."),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, GET_COMBAT_STATE_CAPABILITY, mode === undefined ? {} : { mode });
        const validation = validateGetCombatStateOutput(result);
        if (!validation.valid || !validation.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned invalid combat state.", false, { validationErrors: validation.errors });
        return { content: [{ type: "text", text: JSON.stringify(validation.value) }], structuredContent: validation.value };
      } catch (error) { return toolError(error, "LoreBridge could not retrieve the Foundry combat state."); }
    },
  );

  server.registerTool(
    rollDiceToolName,
    {
      title: "Roll Foundry dice",
      description: "Evaluate a standard Foundry dice formula using the connected GM's Foundry dice engine. Set postToChat to true only to create a public Foundry chat message attributed to LoreBridge.",
      inputSchema: z.object({
        formula: z.string().trim().min(1).max(200).describe("A standard Foundry dice formula, for example 1d20+5 or 4d6kh3."),
        postToChat: z.boolean().optional().describe("When true, explicitly post this roll as a public Foundry chat message. Defaults to false."),
        sourceId: z.string().trim().min(1).optional().describe("LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ formula, postToChat, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, ROLL_DICE_CAPABILITY, { formula, ...(postToChat === undefined ? {} : { postToChat }) });
        const validation = validateRollDiceOutput(result);
        if (!validation.valid || !validation.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned an invalid dice roll.", false, { validationErrors: validation.errors });
        return { content: [{ type: "text", text: JSON.stringify(validation.value) }], structuredContent: validation.value };
      } catch (error) { return toolError(error, "LoreBridge could not evaluate the Foundry dice formula."); }
    },
  );

  server.registerTool(chatMessagesToolName, { title: "Get Foundry chat messages", description: "Retrieve bounded recent Foundry chat history. GM mode includes GM-visible whispers; player mode excludes all whispers.", inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional(), mode: z.enum(["gm", "player"]).optional(), sourceId: z.string().trim().min(1).optional() }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ limit, mode, sourceId }) => { try { const result = await adapterSessions.invoke(sourceId, GET_CHAT_MESSAGES_CAPABILITY, { ...(limit === undefined ? {} : { limit }), ...(mode === undefined ? {} : { mode }) }); const valid = validateGetChatMessagesOutput(result); if (!valid.valid || !valid.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned invalid chat messages.", false); return { content: [{ type: "text", text: JSON.stringify(valid.value) }], structuredContent: valid.value }; } catch (error) { return toolError(error, "LoreBridge could not retrieve Foundry chat messages."); } });
  server.registerTool(searchAssetsToolName, { title: "Search Foundry assets", description: "Search configured Foundry data image and audio assets by filename. Results are capped at 20 and return Foundry-relative paths.", inputSchema: z.object({ query:z.string().trim().min(1), type:z.enum(["image","audio"]).optional(), folder:z.string().trim().min(1).optional(), sourceId:z.string().trim().min(1).optional() }), annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false} }, async ({query,type,folder,sourceId})=>{ try { const results=await assets.search(query,type,folder); const result={sourceId:sourceId??"foundry:data",sourceName:"Foundry data",query,results}; const valid=validateSearchAssetsOutput(result); if(!valid.valid||!valid.value) throw new Error("Asset search returned invalid results."); return {content:[{type:"text",text:JSON.stringify(valid.value)}],structuredContent:valid.value}; } catch(error){return toolError(error,"LoreBridge could not search Foundry assets.");} });

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
        folderId: z.string().trim().min(1).optional().describe(
          "Optional Foundry folder ID to restrict results to items in that folder.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
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
    async ({ query, limit, types, mode, folderId, excludeFolderIds, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_ITEMS_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(types === undefined ? {} : { types }),
            ...(mode === undefined ? {} : { mode }),
            ...(folderId === undefined ? {} : { folderId }),
            ...(excludeFolderIds === undefined ? {} : { excludeFolderIds }),
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

  server.registerTool(
    searchSessionLogsToolName,
    {
      title: "Search Foundry session logs",
      description: "Search journal pages in the GM-designated session log folder by keyword. Returns matched entries with session numbers and excerpts. Use get_session_log to retrieve the full text of a match. Session log journals must be in the folder named in the LoreBridge world setting (default: 'Session Logs').",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe(
          "Keyword or phrase to find across session log page names and content — e.g. an NPC name, location, or event.",
        ),
        limit: z.number().int().min(1).max(50).optional().describe(
          "Maximum number of matches to return. Defaults to 20.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
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
          SEARCH_SESSION_LOGS_CAPABILITY,
          { query, ...(limit === undefined ? {} : { limit }) },
        );
        const validation = validateSearchSessionLogsOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid session log search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not search Foundry session logs.");
      }
    },
  );

  server.registerTool(
    getSessionLogToolName,
    {
      title: "Get a Foundry session log page",
      description: "Retrieve the full text of one session log journal page. Use journalId and pageId from search_session_logs results.",
      inputSchema: z.object({
        journalId: z.string().trim().min(1).describe(
          "The Foundry JournalEntry ID returned by search_session_logs.",
        ),
        pageId: z.string().trim().min(1).describe(
          "The Foundry JournalEntryPage ID returned by search_session_logs.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
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
          GET_SESSION_LOG_CAPABILITY,
          { journalId, pageId },
        );
        const validation = validateGetSessionLogOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid session log page.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not retrieve the session log page.");
      }
    },
  );

  server.registerTool(
    "list_compendiums",
    {
      title: "List Foundry compendiums",
      description: "List all compendium packs available in the connected Foundry world, with their document type and entry count. Excluded packs (configured in LoreBridge world settings) are omitted.",
      inputSchema: z.object({
        documentType: z.string().trim().min(1).optional().describe(
          "Filter by document type, e.g. 'Item', 'Actor', 'JournalEntry', 'Scene'.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ documentType, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          LIST_COMPENDIUMS_CAPABILITY,
          { ...(documentType ? { documentType } : {}) },
        );
        const validation = validateListCompendiumsOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid compendium list.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not list compendiums.");
      }
    },
  );

  server.registerTool(
    "search_compendium",
    {
      title: "Search Foundry compendium indexes",
      description: "Search compendium pack indexes by entry name without loading full documents. Returns matching entries with their UUID, pack, and document type. Use get_compendium_entry to retrieve a specific entry.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe(
          "Name fragment to search for across compendium entry names.",
        ),
        packId: z.string().trim().min(1).optional().describe(
          "Restrict search to a single compendium pack by ID (e.g. 'dnd5e.spells').",
        ),
        documentType: z.string().trim().min(1).optional().describe(
          "Restrict search to packs of this document type (e.g. 'Item', 'Actor').",
        ),
        limit: z.number().int().min(1).max(50).optional().describe(
          "Maximum results to return (default 20, max 50).",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, packId, documentType, limit, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_COMPENDIUM_CAPABILITY,
          {
            query,
            ...(packId ? { packId } : {}),
            ...(documentType ? { documentType } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
        );
        const validation = validateSearchCompendiumOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid compendium search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not search the compendium.");
      }
    },
  );

  server.registerTool(
    "get_compendium_entry",
    {
      title: "Get a Foundry compendium entry",
      description: "Retrieve a specific compendium entry by pack ID and entry ID. Returns the entry's name, type, UUID, and image. Use packId and entryId from search_compendium results.",
      inputSchema: z.object({
        packId: z.string().trim().min(1).describe(
          "The compendium pack ID returned by list_compendiums or search_compendium (e.g. 'dnd5e.spells').",
        ),
        entryId: z.string().trim().min(1).describe(
          "The entry ID returned by search_compendium.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ packId, entryId, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          GET_COMPENDIUM_ENTRY_CAPABILITY,
          { packId, entryId },
        );
        const validation = validateGetCompendiumEntryOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid compendium entry.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not retrieve the compendium entry.");
      }
    },
  );

  server.registerTool(
    "propose_journal_update",
    {
      title: "Propose a journal page update",
      description: "Propose a change to a Foundry VTT journal page. Returns a one-time approval token and a before/after preview. No content is modified until the GM explicitly approves the change by running `await LoreBridge.approveWrite(token)` in the Foundry browser console. Requires the 'Enable AI-Proposed Writes' world setting to be on.",
      inputSchema: z.object({
        journalId: z.string().trim().min(1).describe(
          "The Foundry journal ID (not UUID). Use search_journals or get_journal_page to find the correct ID.",
        ),
        pageId: z.string().trim().min(1).describe(
          "The Foundry journal page ID (not UUID). Use search_journals or get_journal_page to find the correct ID.",
        ),
        proposedContent: z.string().min(1).describe(
          "The complete proposed HTML content for the journal page. This replaces the current text content.",
        ),
        rationale: z.string().min(1).describe(
          "Why this change is being proposed. Shown to the GM so they can make an informed decision.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ journalId, pageId, proposedContent, rationale, sourceId }) => {
      try {
        const pageResult = await adapterSessions.invoke(
          sourceId,
          GET_JOURNAL_PAGE_CAPABILITY,
          { journalId, pageId },
        );
        const pageValidation = validateGetJournalPageOutput(pageResult);
        if (!pageValidation.valid || !pageValidation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid journal page.",
            false,
            { validationErrors: pageValidation.errors },
          );
        }
        const { page, journal } = pageValidation.value;
        const currentContent = page.text?.html ?? "";
        const entry = writes.register({
          journalId,
          pageId,
          pageName: page.name,
          journalName: journal.name,
          currentContent,
          proposedContent,
          rationale,
          sourceId,
        });
        adapterSessions.sendEvent(sourceId, LOREBRIDGE_EVENTS.approvalRequired, {
          token: entry.token,
          journalId,
          pageId,
          pageName: page.name,
          journalName: journal.name,
          currentContent,
          proposedContent,
          rationale,
          expiresAt: entry.expiresAt.toISOString(),
        });
        const preview = {
          token: entry.token,
          journalId,
          pageId,
          pageName: page.name,
          journalName: journal.name,
          currentContent,
          proposedContent,
          rationale,
          expiresAt: entry.expiresAt.toISOString(),
          instruction: `A write approval request has been sent to Foundry chat. If you don't see the whisper, you can approve manually:\nawait LoreBridge.approveWrite("${entry.token}")`,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(preview) }],
          structuredContent: preview,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not propose the journal update.");
      }
    },
  );

  server.registerTool(
    "generate_roll_table",
    {
      title: "Generate a roll table",
      description: "Ask the AI to generate a themed roll table and propose it for creation in Foundry VTT as a RollTable document. The GM sees a preview dialog and must approve before anything is created.",
      inputSchema: z.object({
        prompt: z.string().trim().min(1).describe(
          "A description of what the roll table should contain, e.g. 'random dungeon loot for level 5 party', 'wilderness encounters in a cursed forest', 'tavern rumors and plot hooks'.",
        ),
        count: z.number().int().min(2).max(20).default(10).describe(
          "Number of entries to generate. Default 10, max 20.",
        ),
        tone: z.enum(["gothic", "neutral", "heroic", "mysterious"]).default("neutral").describe(
          "Tone for the generated entries.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one compatible Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ prompt, count, tone, sourceId }) => {
      try {
        if (!provider.enabled) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "No AI provider is configured on this backend." }) }], isError: true };
        }

        const worldSummaryResult = await adapterSessions.invoke(sourceId, GET_WORLD_SUMMARY_CAPABILITY, {}).catch(() => null);
        const worldName = (worldSummaryResult as { world?: { title?: string } } | null)?.world?.title ?? "Unknown World";

        const result = await generateRollTable(provider, { prompt, count, tone, worldName });

        adapterSessions.sendEvent(sourceId, LOREBRIDGE_EVENTS.rollTableApprovalRequired, {
          name: result.name,
          entries: result.entries,
          prompt,
        });

        const preview = {
          name: result.name,
          entryCount: result.entries.length,
          entries: result.entries,
          instruction: "A roll table approval request has been sent to Foundry. The GM must approve it before the RollTable is created.",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(preview) }],
          structuredContent: preview,
        };
      } catch (error) {
        if (error instanceof GenerationError) {
          return { content: [{ type: "text", text: JSON.stringify({ error: error.message }) }], isError: true };
        }
        return toolError(error, "LoreBridge could not generate the roll table.");
      }
    },
  );

  server.registerTool(
    searchRollTablesToolName,
    {
      title: "Search Foundry roll tables",
      description: "Search world-level roll tables in a connected Foundry VTT world by name or description. Returns lightweight matches including folder context.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Text to find in roll table names or descriptions."),
        limit: z.number().int().min(1).max(50).optional(),
        mode: z.enum(["gm", "player"]).optional().describe(
          "Visibility mode. 'gm' (default) returns all roll tables. 'player' filters to roll tables visible to players.",
        ),
        folderId: z.string().trim().min(1).optional().describe(
          "Optional Foundry folder ID to restrict results to roll tables in that folder.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
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
    async ({ query, limit, mode, folderId, excludeFolderIds, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          SEARCH_ROLL_TABLES_CAPABILITY,
          {
            query,
            ...(limit === undefined ? {} : { limit }),
            ...(mode === undefined ? {} : { mode }),
            ...(folderId === undefined ? {} : { folderId }),
            ...(excludeFolderIds === undefined ? {} : { excludeFolderIds }),
          },
        );
        const validation = validateSearchRollTablesOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid roll table search results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not search Foundry roll tables.");
      }
    },
  );

  server.registerTool(
    listPlaylistsToolName,
    {
      title: "List Foundry playlists",
      description: "List world playlists with their current playback state and track count.",
      inputSchema: z.object({
        mode: z.enum(["gm", "player"]).optional().describe("Visibility mode. 'gm' (default) returns all playlists; 'player' returns only player-visible playlists."),
        sourceId: z.string().trim().min(1).optional().describe("LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected."),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mode, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, LIST_PLAYLISTS_CAPABILITY, { ...(mode === undefined ? {} : { mode }) });
        const validation = validateListPlaylistsOutput(result);
        if (!validation.valid || !validation.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned invalid playlist results.", false, { validationErrors: validation.errors });
        return { content: [{ type: "text", text: JSON.stringify(validation.value) }], structuredContent: validation.value };
      } catch (error) {
        return toolError(error, "LoreBridge could not list Foundry playlists.");
      }
    },
  );

  server.registerTool(
    searchPlaylistsToolName,
    {
      title: "Search Foundry playlists",
      description: "Search world playlists by name. Returns folder context, current playback state, and track count.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Text to find in playlist names."),
        limit: z.number().int().min(1).max(50).optional(),
        mode: z.enum(["gm", "player"]).optional().describe("Visibility mode. 'gm' (default) returns all matching playlists; 'player' filters to player-visible playlists."),
        folderId: z.string().trim().min(1).optional().describe("Optional Foundry folder ID to restrict results to playlists in that folder."),
        sourceId: z.string().trim().min(1).optional().describe("LoreBridge source identifier. Omit it when exactly one compatible Foundry world is connected."),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit, mode, folderId, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, SEARCH_PLAYLISTS_CAPABILITY, { query, ...(limit === undefined ? {} : { limit }), ...(mode === undefined ? {} : { mode }), ...(folderId === undefined ? {} : { folderId }) });
        const validation = validateSearchPlaylistsOutput(result);
        if (!validation.valid || !validation.value) throw new AdapterInvocationError("INTERNAL_ERROR", "The Foundry adapter returned invalid playlist search results.", false, { validationErrors: validation.errors });
        return { content: [{ type: "text", text: JSON.stringify(validation.value) }], structuredContent: validation.value };
      } catch (error) {
        return toolError(error, "LoreBridge could not search Foundry playlists.");
      }
    },
  );

  server.registerTool(
    "list_macro_tools",
    {
      title: "List GM macro tools",
      description: "List custom MCP tools defined in GM-authored Foundry macros. Returns tool names, descriptions, and parameter schemas. Use call_macro_tool to invoke a discovered tool.",
      inputSchema: z.object({
        folderId: z.string().trim().min(1).optional().describe(
          "Optional Foundry folder ID to restrict results to macros in that folder.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ folderId, excludeFolderIds, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          LIST_MACRO_TOOLS_CAPABILITY,
          { ...(folderId === undefined ? {} : { folderId }), ...(excludeFolderIds === undefined ? {} : { excludeFolderIds }) },
        );
        const validation = validateListMacroToolsOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid macro tool list.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not list macro tools.");
      }
    },
  );

  server.registerTool(
    "list_macros",
    {
      title: "List all macros",
      description: "List all script macros in the Foundry world, regardless of whether they have a loreBridgeTool config block. Each entry includes an isCallable flag indicating whether the macro can be invoked via call_macro_tool. Use this to discover macros that exist but are not yet registered as callable tools.",
      inputSchema: z.object({
        folderId: z.string().trim().min(1).optional().describe(
          "Filter to macros inside a specific folder by folder ID.",
        ),
        excludeFolderIds: z.array(z.string().trim().min(1)).optional().describe(
          "Optional list of Foundry folder IDs to exclude from results.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ folderId, excludeFolderIds, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(sourceId, LIST_MACROS_CAPABILITY, { ...(folderId ? { folderId } : {}), ...(excludeFolderIds ? { excludeFolderIds } : {}) });
        const validation = validateListMacrosOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid macro list.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not list macros.");
      }
    },
  );

  server.registerTool(
    "call_macro_tool",
    {
      title: "Call a GM macro tool",
      description: "Execute a custom tool defined in a GM-authored Foundry macro. Use list_macro_tools first to discover available tools and their parameter schemas. The GM must have authored a macro with a loreBridgeTool config block; see LoreBridge docs for the format.",
      inputSchema: z.object({
        toolName: z.string().trim().min(1).describe(
          "The tool name as defined in the macro's loreBridgeTool config (the name field, not the macro name).",
        ),
        args: z.record(z.string(), z.unknown()).optional().describe(
          "Arguments to pass to the macro. Must match the tool's declared parameter schema.",
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ toolName, args, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          EXECUTE_MACRO_TOOL_CAPABILITY,
          { toolName, args: args ?? {} },
          30_000,
        );
        const validation = validateExecuteMacroToolOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned an invalid macro tool result.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not execute the macro tool.");
      }
    },
  );

  server.registerTool(
    "list_backup_commits",
    {
      title: "List campaign backup commits",
      description: "List recent backup commits in the GitHub campaign repository",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional().describe(
          "Number of commits to return. Defaults to 10, max 20.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit }) => {
      try {
        if (!github) {
          return { isError: true as const, content: [{ type: "text" as const, text: "GitHub backup is not configured on this backend." }] };
        }
        const commits = await github.listCommits(limit ?? 10);
        const result = { commits };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not list backup commits.");
      }
    },
  );

  server.registerTool(
    "check_campaign_health",
    {
      title: "Check campaign health",
      description: "Run a read-only audit of the connected Foundry world and return categorized integrity findings: broken @UUID links, missing or unavailable image assets, player-visible documents linking to GM-only content, suspiciously duplicate names, and empty folders. Each finding includes the source UUID and a description. No world data is modified.",
      inputSchema: z.object({
        checks: z.array(z.enum(ALL_HEALTH_CHECK_CATEGORIES as [string, ...string[]])).min(1).optional().describe(
          `Checks to run. Defaults to all: ${ALL_HEALTH_CHECK_CATEGORIES.join(", ")}.`,
        ),
        limit: z.number().int().min(1).max(HEALTH_CHECK_MAX_LIMIT).optional().describe(
          `Maximum number of findings to return. Defaults to 100, max ${HEALTH_CHECK_MAX_LIMIT}.`,
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ checks, limit, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          CHECK_CAMPAIGN_HEALTH_CAPABILITY,
          {
            ...(checks !== undefined ? { checks } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
        );
        const validation = validateCheckCampaignHealthOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid campaign health results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not run the campaign health check.");
      }
    },
  );

  server.registerTool(
    "audit_campaign_consistency",
    {
      title: "Audit campaign consistency",
      description: "Use AI to audit campaign documents for contradictory facts, duplicate entities, and timeline conflicts. Gathers journal pages, actor biographies, and scene descriptions from the connected Foundry world and analyzes them for internal inconsistencies. Returns structured findings with severity, confidence, affected sources, and suggested fixes.",
      inputSchema: z.object({
        focus: z.string().trim().min(1).max(200).optional().describe(
          "Optional keyword to prioritize documents about a specific topic, NPC, or location (e.g. 'Ironhold', 'Theron').",
        ),
        limit: z.number().int().min(1).max(CONSISTENCY_AUDIT_MAX_LIMIT).optional().describe(
          `Maximum number of findings to return. Defaults to 20, max ${CONSISTENCY_AUDIT_MAX_LIMIT}.`,
        ),
        sourceId: z.string().trim().min(1).optional().describe(
          "LoreBridge source identifier. Omit when exactly one Foundry world is connected.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ focus, limit, sourceId }) => {
      try {
        const result = await adapterSessions.invoke(
          sourceId,
          AUDIT_CAMPAIGN_CONSISTENCY_CAPABILITY,
          {
            ...(focus !== undefined ? { focus } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
        );
        const validation = validateAuditCampaignConsistencyOutput(result);
        if (!validation.valid || !validation.value) {
          throw new AdapterInvocationError(
            "INTERNAL_ERROR",
            "The Foundry adapter returned invalid campaign consistency audit results.",
            false,
            { validationErrors: validation.errors },
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(validation.value) }],
          structuredContent: validation.value,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not run the campaign consistency audit.");
      }
    },
  );

  server.registerTool(
    "read_backup_file",
    {
      title: "Read a campaign backup file",
      description: "Read a file from the GitHub campaign backup repository",
      inputSchema: z.object({
        path: z.string().trim().min(1).describe(
          "Path to the file relative to the campaign root.",
        ),
        ref: z.string().trim().min(1).optional().describe(
          "Optional commit SHA to read the file at. Defaults to branch HEAD.",
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path, ref }) => {
      try {
        if (!github) {
          return { isError: true as const, content: [{ type: "text" as const, text: "GitHub backup is not configured on this backend." }] };
        }
        const content = ref
          ? await github.readFileAtRef(path, ref)
          : await github.readFile(path);
        const result = { path, ref: ref ?? github.branch, content };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return toolError(error, "LoreBridge could not read the backup file.");
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
  writes: WriteRegistry,
  provider: ProviderService,
  assets = new AssetSearchService(),
  github: GitHubAdapter | null = null,
): McpRequestHandler {
  const handler = createMcpHandler(
    () => createServer(adapterSessions, writes, provider, assets, github),
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
