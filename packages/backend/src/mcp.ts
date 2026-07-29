import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import {
  GET_JOURNAL_PAGE_CAPABILITY,
  GET_WORLD_SUMMARY_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  validateGetJournalPageOutput,
  validateGetWorldSummaryOutput,
  validateSearchJournalsOutput,
} from "@lorebridge/shared/capabilities";
import {
  AdapterInvocationError,
  type AdapterSessionRegistry,
} from "./adapter-sessions.js";

const worldSummaryToolName = "get_world_summary";
const journalSearchToolName = "search_journals";
const journalPageToolName = "get_journal_page";

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
