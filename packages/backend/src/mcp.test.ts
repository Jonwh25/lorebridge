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
  GetActorOutput,
  GetJournalPageOutput,
  GetRelatedDocumentsOutput,
  GetWorldSummaryOutput,
  RollDiceOutput,
  ResolveUuidOutput,
  SearchCampaignOutput,
  SearchJournalsOutput,
  SearchActorsOutput,
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

test("MCP endpoint requires pairing and exposes live Foundry tools", async () => {
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
              {
                name: "getJournalPage",
                mode: "read",
                version: "0.1",
              },
              {
                name: "searchActors",
                mode: "read",
                version: "0.1",
              },
              {
                name: "getActor",
                mode: "read",
                version: "0.1",
              },
              {
                name: "searchScenes",
                mode: "read",
                version: "0.1",
              },
              {
                name: "getScene",
                mode: "read",
                version: "0.1",
              },
              {
                name: "getActiveScene",
                mode: "read",
                version: "0.1",
              },
              {
                name: "getCombatState",
                mode: "read",
                version: "0.1",
              },
              {
                name: "proposeCombatWrite",
                mode: "write",
                version: "0.1",
                requiresApproval: true,
              },
              {
                name: "rollDice",
                mode: "write",
                version: "0.1",
              },
              {
                name: "resolveUuid",
                mode: "read",
                version: "0.1",
              },
              {
                name: "searchCampaign",
                mode: "read",
                version: "0.1",
              },
              {
                name: "getRelatedDocuments",
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
        const input = message.input as { query: string; limit?: number; mode?: string };
        assert.equal(input.query, "Tser Falls");
      } else if (message.capability === "getJournalPage") {
        assert.deepEqual(message.input, {
          journalId: "journal_locations",
          pageId: "page_tser_falls",
        });
      } else if (message.capability === "searchActors") {
        assert.deepEqual(message.input, { query: "Strahd", limit: 10, types: ["npc"] });
      } else if (message.capability === "getActor") {
        assert.deepEqual(message.input, { actorId: "actor_strahd" });
      } else if (message.capability === "rollDice") {
        assert.deepEqual(message.input, { formula: "4d6kh3", postToChat: false });
      } else if (message.capability === "proposeCombatWrite") {
        const action = (message.input as { action: string }).action;
        if (action === "nextTurn") assert.deepEqual(message.input, { action: "nextTurn", rationale: "Continue the encounter." });
        else assert.deepEqual(message.input, { action: "setInitiative", combatantId: "cb2", initiative: 18, rationale: "Correct the roll." });
      }
      const output = message.capability === "searchJournals"
        ? {
            sourceId: "foundry:cos",
            sourceName: "Curse of Strahd",
            query: (message.input as { query: string }).query,
            results: [{
              journalId: "journal_locations",
              journalUuid: "JournalEntry.journal_locations",
              journalName: "Locations & NPCs",
              pageCount: 30,
              matchedPageId: "page_tser_falls",
              matchedPageUuid: "JournalEntry.journal_locations.JournalEntryPage.page_tser_falls",
              matchedPageName: "Tser Falls",
              matchedField: "pageName",
            }],
            hiddenCount: 0,
          }
        : message.capability === "getJournalPage"
          ? {
              sourceId: "foundry:cos",
              sourceName: "Curse of Strahd",
              journal: {
                id: "journal_locations",
                uuid: "JournalEntry.journal_locations",
                name: "Locations & NPCs",
              },
              page: {
                id: "page_tser_falls",
                uuid: "JournalEntry.journal_locations.JournalEntryPage.page_tser_falls",
                name: "Tser Falls",
                type: "text",
                sort: 0,
                text: {
                  format: 1,
                  html: "<p>The falls plunge into mist.</p>",
                  plainText: "The falls plunge into mist.",
                },
              },
            }
        : message.capability === "searchActors"
          ? {
              sourceId: "foundry:cos",
              sourceName: "Curse of Strahd",
              query: "Strahd",
              results: [{
                actorId: "actor_strahd",
                actorUuid: "Actor.actor_strahd",
                actorName: "Strahd von Zarovich",
                actorType: "npc",
                matchedField: "actorName",
              }],
              hiddenCount: 0,
            }
        : message.capability === "getActor"
          ? {
              sourceId: "foundry:cos",
              sourceName: "Curse of Strahd",
              systemId: "dnd5e",
              id: "actor_strahd",
              uuid: "Actor.actor_strahd",
              name: "Strahd von Zarovich",
              type: "npc",
              description: { plainText: "The vampire lord of Barovia." },
            }
        : message.capability === "rollDice"
          ? {
              sourceId: "foundry:cos",
              sourceName: "Curse of Strahd",
              formula: "4d6kh3",
              total: 16,
              breakdown: "6 + 5 + 5 + 1",
              rolls: [{ faces: 6, results: [{ value: 6, active: true }, { value: 5, active: true }, { value: 5, active: true }, { value: 1, active: false }] }],
              postedToChat: false,
            }
        : message.capability === "proposeCombatWrite" && (message.input as { action: string }).action === "nextTurn"
          ? {
              action: "nextTurn", combatUuid: "Combat.c1", expectedRound: 2, expectedTurn: 0,
              target: { combatUuid: "Combat.c1" }, parameters: { expectedNextCombatantId: "cb2" },
              rationale: "Continue the encounter.", beforeSummary: "Strahd is active.", afterSummary: "Ireena will be active.",
              snapshot: { combatUuid: "Combat.c1", combatName: "Castle Battle", round: 2, turn: 0, currentCombatantId: "cb1", combatants: [{ id: "cb1", name: "Strahd", initiative: 20 }, { id: "cb2", name: "Ireena", initiative: 15 }], fingerprint: "fnv1a-deadbeef" },
              token: "combat-token", expiresAt: "2026-08-08T12:01:00.000Z", instruction: "Approve in Foundry.",
            }
        : message.capability === "proposeCombatWrite"
          ? {
              action: "setInitiative", combatUuid: "Combat.c1", expectedRound: 2, expectedTurn: 0,
              target: { combatUuid: "Combat.c1" }, parameters: { combatantId: "cb2", expectedInitiative: 15, initiative: 18 },
              rationale: "Correct the roll.", beforeSummary: "Ireena is at 15.", afterSummary: "Ireena will be at 18.",
              snapshot: { combatUuid: "Combat.c1", combatName: "Castle Battle", round: 2, turn: 0, currentCombatantId: "cb1", combatants: [{ id: "cb1", name: "Strahd", initiative: 20 }, { id: "cb2", name: "Ireena", initiative: 15 }], fingerprint: "fnv1a-deadbeef" },
              token: "initiative-token", expiresAt: "2026-08-08T12:01:00.000Z", instruction: "Approve in Foundry.",
            }
        : message.capability === "searchCampaign"
          ? {
              sourceId: "foundry:cos",
              sourceName: "Curse of Strahd",
              query: (message.input as { query: string }).query,
              results: [
                {
                  documentType: "journal",
                  journalId: "journal_locations",
                  journalUuid: "JournalEntry.journal_locations",
                  journalName: "Tser Falls",
                  pageCount: 1,
                  matchedField: "journalName",
                },
                {
                  documentType: "scene",
                  sceneId: "scene_tser_falls",
                  sceneUuid: "Scene.scene_tser_falls",
                  sceneName: "Tser Falls",
                  active: false,
                  navigation: true,
                  matchedField: "sceneName",
                },
              ],
              hiddenCount: 0,
            }
        : message.capability === "getRelatedDocuments"
          ? {
              sourceId: "foundry:cos",
              sourceName: "Curse of Strahd",
              uuid: "Scene.scene_tser_falls",
              documentType: "scene",
              name: "Tser Falls",
              related: [
                {
                  uuid: "JournalEntry.journal_locations.JournalEntryPage.page_tser_falls",
                  documentType: "journalPage",
                  name: "Tser Falls",
                  relationshipType: "sceneLinkedJournal",
                },
                {
                  uuid: "Actor.actor_vistani",
                  documentType: "actor",
                  name: "Vistani Wanderer",
                  relationshipType: "sceneToken",
                },
              ],
            }
        : message.capability === "resolveUuid"
          ? {
              sourceId: "foundry:cos",
              sourceName: "Curse of Strahd",
              uuid: "Actor.actor_strahd",
              documentType: "actor",
              document: {
                sourceId: "foundry:cos",
                sourceName: "Curse of Strahd",
                systemId: "dnd5e",
                id: "actor_strahd",
                uuid: "Actor.actor_strahd",
                name: "Strahd von Zarovich",
                type: "npc",
                description: { plainText: "The vampire lord of Barovia." },
              },
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
      ["next_turn", "set_initiative", "get_world_summary", "search_campaign", "search_journals", "get_journal_page", "search_actors", "get_actor", "search_scenes", "get_scene", "get_combat_state", "roll_dice", "get_chat_messages", "search_assets", "get_active_scene", "resolve_uuid", "get_related_documents", "search_items", "get_actor_inventory", "search_session_logs", "get_session_log", "list_compendiums", "search_compendium", "get_compendium_entry", "propose_journal_update", "generate_roll_table", "list_macro_tools", "call_macro_tool", "list_backup_commits", "check_campaign_health", "audit_campaign_consistency", "read_backup_file"],
    );
    const readOnlyTools = tools.tools.filter((t) => t.name !== "next_turn" && t.name !== "set_initiative" && t.name !== "propose_journal_update" && t.name !== "generate_roll_table" && t.name !== "roll_dice" && t.name !== "call_macro_tool");
    assert.ok(readOnlyTools.every((tool) => tool.annotations?.readOnlyHint));
    const proposeToolAnnotations = tools.tools.find((t) => t.name === "propose_journal_update")?.annotations;
    assert.equal(proposeToolAnnotations?.readOnlyHint, false);
    const nextTurnAnnotations = tools.tools.find((t) => t.name === "next_turn")?.annotations;
    assert.equal(nextTurnAnnotations?.readOnlyHint, false);
    assert.equal(nextTurnAnnotations?.idempotentHint, false);
    assert.equal(tools.tools.find((t) => t.name === "set_initiative")?.annotations?.readOnlyHint, false);

    const nextTurnResult = await client.callTool({ name: "next_turn", arguments: { rationale: "Continue the encounter.", sourceId: "foundry:cos" } });
    assert.equal(nextTurnResult.isError, undefined);
    assert.equal((nextTurnResult.structuredContent as { action: string }).action, "nextTurn");
    const initiativeResult = await client.callTool({ name: "set_initiative", arguments: { combatantId: "cb2", initiative: 18, rationale: "Correct the roll.", sourceId: "foundry:cos" } });
    assert.equal(initiativeResult.isError, undefined);
    assert.equal((initiativeResult.structuredContent as { action: string }).action, "setInitiative");

    const result = await client.callTool({
      name: "get_world_summary",
      arguments: { sourceId: "foundry:cos" },
    });
    const summary = result.structuredContent as unknown as GetWorldSummaryOutput;
    assert.equal(result.isError, undefined);
    assert.equal(summary.world.title, "Curse of Strahd");
    assert.equal(summary.counts.journals, 851);

    const rollResult = await client.callTool({
      name: "roll_dice",
      arguments: { formula: "4d6kh3", postToChat: false, sourceId: "foundry:cos" },
    });
    const dice = rollResult.structuredContent as unknown as RollDiceOutput;
    assert.equal(rollResult.isError, undefined);
    assert.equal(dice.total, 16);
    assert.equal(dice.rolls[0]?.results[3]?.active, false);

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
    assert.equal(search.hiddenCount, 0);

    const pageResult = await client.callTool({
      name: "get_journal_page",
      arguments: {
        journalId: search.results[0]?.journalId,
        pageId: search.results[0]?.matchedPageId,
        sourceId: "foundry:cos",
      },
    });
    const page = pageResult.structuredContent as unknown as GetJournalPageOutput;
    assert.equal(pageResult.isError, undefined);
    assert.equal(page.journal.name, "Locations & NPCs");
    assert.equal(page.page.name, "Tser Falls");
    assert.equal(page.page.text?.plainText, "The falls plunge into mist.");

    const actorSearchResult = await client.callTool({
      name: "search_actors",
      arguments: {
        query: "Strahd",
        limit: 10,
        types: ["npc"],
        sourceId: "foundry:cos",
      },
    });
    const actorSearch = actorSearchResult.structuredContent as unknown as SearchActorsOutput;
    assert.equal(actorSearchResult.isError, undefined);
    assert.equal(actorSearch.results[0]?.actorUuid, "Actor.actor_strahd");

    const actorResult = await client.callTool({
      name: "get_actor",
      arguments: {
        actorId: actorSearch.results[0]?.actorId,
        sourceId: "foundry:cos",
      },
    });
    const actor = actorResult.structuredContent as unknown as GetActorOutput;
    assert.equal(actorResult.isError, undefined);
    assert.equal(actor.name, "Strahd von Zarovich");
    assert.equal(actor.description?.plainText, "The vampire lord of Barovia.");

    const resolveResult = await client.callTool({
      name: "resolve_uuid",
      arguments: {
        uuid: "Actor.actor_strahd",
        sourceId: "foundry:cos",
      },
    });
    const resolved = resolveResult.structuredContent as unknown as ResolveUuidOutput;
    assert.equal(resolveResult.isError, undefined);
    assert.equal(resolved.documentType, "actor");
    assert.equal(resolved.uuid, "Actor.actor_strahd");
    assert.equal((resolved.document as GetActorOutput).name, "Strahd von Zarovich");

    const campaignSearchResult = await client.callTool({
      name: "search_campaign",
      arguments: { query: "Tser Falls", sourceId: "foundry:cos" },
    });
    const campaignSearch = campaignSearchResult.structuredContent as unknown as SearchCampaignOutput;
    assert.equal(campaignSearchResult.isError, undefined);
    assert.equal(campaignSearch.query, "Tser Falls");
    assert.equal(campaignSearch.results.length, 2);
    assert.equal(campaignSearch.results[0]?.documentType, "journal");
    assert.equal(campaignSearch.results[1]?.documentType, "scene");
    assert.equal(campaignSearch.hiddenCount, 0);

    const playerSearchResult = await client.callTool({
      name: "search_journals",
      arguments: { query: "Tser Falls", limit: 10, mode: "player", sourceId: "foundry:cos" },
    });
    const playerSearch = playerSearchResult.structuredContent as unknown as SearchJournalsOutput;
    assert.equal(playerSearchResult.isError, undefined);
    assert.equal(typeof playerSearch.hiddenCount, "number");

    const relatedResult = await client.callTool({
      name: "get_related_documents",
      arguments: { uuid: "Scene.scene_tser_falls", sourceId: "foundry:cos" },
    });
    const related = relatedResult.structuredContent as unknown as GetRelatedDocumentsOutput;
    assert.equal(relatedResult.isError, undefined);
    assert.equal(related.documentType, "scene");
    assert.equal(related.name, "Tser Falls");
    assert.equal(related.related.length, 2);
    assert.equal(related.related[0]?.relationshipType, "sceneLinkedJournal");
    assert.equal(related.related[1]?.relationshipType, "sceneToken");
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
