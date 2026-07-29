import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  createResponseEnvelope,
  LOREBRIDGE_PROTOCOL_VERSION,
  type AdapterWelcomeMessage,
  type RequestEnvelope,
} from "@lorebridge/shared";
import type {
  GetWorldSummaryOutput,
  SearchJournalsOutput,
} from "@lorebridge/shared/capabilities";
import { WebSocket } from "ws";
import { createLoreBridgeServer } from "./app.js";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";

const config: BackendConfig = {
  host: "127.0.0.1",
  port: 3210,
  pairingEnabled: true,
  pairingTtlSeconds: 300,
  dataDir: ".lorebridge-test",
};

const identity: BackendIdentity = {
  id: "lb_test",
  secret: "test-secret-that-is-not-used-outside-tests",
  createdAt: "2026-07-29T00:00:00.000Z",
  fingerprint: "test:fingerprint",
};

async function pair(baseUrl: string): Promise<string> {
  const startResponse = await fetch(`${baseUrl}/v1/pairing/start`, {
    method: "POST",
  });
  const { code } = await startResponse.json() as { code: string };
  const completeResponse = await fetch(`${baseUrl}/v1/pairing/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, clientName: "MCP Test" }),
  });
  return (await completeResponse.json() as { token: string }).token;
}

test("MCP endpoint requires pairing and exposes live read-only Foundry tools", async () => {
  const server = createLoreBridgeServer(config, identity);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let webSocket: WebSocket | undefined;
  let client: Client | undefined;

  try {
    const unauthorized = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });
    assert.equal(unauthorized.status, 401);

    const token = await pair(baseUrl);
    webSocket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/adapter");
    await new Promise<AdapterWelcomeMessage>((resolve, reject) => {
      webSocket!.once("error", reject);
      webSocket!.once("open", () => {
        webSocket!.send(JSON.stringify({
          kind: "adapter.hello",
          protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
          token,
          registration: {
            adapterId: "foundry-vtt",
            adapterType: "foundry",
            adapterVersion: "0.1.6",
            protocolVersions: [LOREBRIDGE_PROTOCOL_VERSION],
            sources: [{
              sourceId: "foundry:cos",
              adapterId: "foundry-vtt",
              sourceType: "foundry-world",
              name: "Curse of Strahd",
            }],
            capabilities: [
              {
                name: "getWorldSummary",
                mode: "read",
                version: "0.1",
              },
              {
                name: "searchJournals",
                mode: "read",
                version: "0.1",
              },
            ],
          },
        }));
      });
      webSocket!.once("message", (data) => {
        resolve(JSON.parse(data.toString()) as AdapterWelcomeMessage);
      });
    });

    webSocket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as
        | AdapterWelcomeMessage
        | RequestEnvelope;
      if (message.kind !== "request") return;
      if (message.capability === "searchJournals") {
        assert.deepEqual(message.input, { query: "Tser Falls", limit: 10 });
      }
      const output = message.capability === "searchJournals"
        ? {
            sourceId: "foundry:cos",
            query: (message.input as { query: string }).query,
            results: [{
              journalId: "journal_locations",
              journalUuid: "JournalEntry.journal_locations",
              journalName: "Locations & NPCs",
              pageCount: 30,
              matchedPageId: "page_tser_falls",
              matchedPageName: "Tser Falls",
              matchedField: "pageName",
            }],
          }
        : {
            source: { sourceId: "foundry:cos", adapterType: "foundry" },
            world: {
              id: "cos",
              title: "Curse of Strahd",
              foundryVersion: "14.365",
            },
            system: {
              id: "dnd5e",
              title: "Dungeons & Dragons Fifth Edition",
              version: "5.3.3",
            },
            counts: {
              actors: 686,
              scenes: 624,
              journals: 851,
              installedModules: 43,
              activeModules: 20,
            },
          };
      webSocket!.send(JSON.stringify(createResponseEnvelope(
        {
          messageId: "message_mcp_response",
          correlationId: message.correlationId,
        },
        output,
      )));
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
      {
        authProvider: { token: async () => token },
      },
    );
    client = new Client({ name: "lorebridge-test", version: "1.0.0" });
    await client.connect(transport);

    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["get_world_summary", "search_journals"],
    );
    assert.ok(tools.tools.every((tool) => tool.annotations?.readOnlyHint));

    const result = await client.callTool({
      name: "get_world_summary",
      arguments: { sourceId: "foundry:cos" },
    });
    const summary = result.structuredContent as unknown as GetWorldSummaryOutput;
    assert.equal(result.isError, undefined);
    assert.equal(summary.world.title, "Curse of Strahd");
    assert.equal(summary.counts.journals, 851);

    const searchResult = await client.callTool({
      name: "search_journals",
      arguments: {
        query: "Tser Falls",
        limit: 10,
        sourceId: "foundry:cos",
      },
    });
    const search = searchResult.structuredContent as unknown as SearchJournalsOutput;
    assert.equal(searchResult.isError, undefined);
    assert.equal(search.query, "Tser Falls");
    assert.equal(search.results[0]?.journalName, "Locations & NPCs");
    assert.equal(search.results[0]?.matchedPageName, "Tser Falls");
  } finally {
    await client?.close();
    webSocket?.close();
    if (webSocket && webSocket.readyState !== WebSocket.CLOSED) {
      await new Promise<void>((resolve) => webSocket!.once("close", () => resolve()));
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
