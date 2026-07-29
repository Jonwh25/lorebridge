import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import {
  GET_WORLD_SUMMARY_CAPABILITY,
  validateGetWorldSummaryOutput,
} from "@lorebridge/shared/capabilities";
import {
  AdapterInvocationError,
  type AdapterSessionRegistry,
} from "./adapter-sessions.js";

const toolName = "get_world_summary";

function createServer(adapterSessions: AdapterSessionRegistry): McpServer {
  const server = new McpServer({
    name: "lorebridge",
    version: "0.2.0",
  });

  server.registerTool(
    toolName,
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
        const message = error instanceof Error
          ? error.message
          : "LoreBridge could not retrieve the Foundry world summary.";
        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
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
