import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createLoreBridgeServer } from "./app.js";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import type { BackendServices } from "./journal-service.js";
import {
  createResponseEnvelope,
  LOREBRIDGE_PROTOCOL_VERSION,
  type RequestEnvelope,
  type AdapterWelcomeMessage,
} from "@lorebridge/shared";
import { WebSocket } from "ws";

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
  createdAt: "2026-07-27T00:00:00.000Z",
  fingerprint: "test:fingerprint",
};

async function withServer(run: (baseUrl: string) => Promise<void>, services: BackendServices = {}): Promise<void> {
  const server = createLoreBridgeServer(config, identity, services);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function pair(baseUrl: string): Promise<string> {
  const startResponse = await fetch(`${baseUrl}/v1/pairing/start`, { method: "POST" });
  const startBody = await startResponse.json() as { code: string };
  const completeResponse = await fetch(`${baseUrl}/v1/pairing/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: startBody.code, clientName: "Foundry Test" }),
  });
  return (await completeResponse.json() as { token: string }).token;
}

test("GET /health reports service health without caching", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.status, "ok");
    assert.equal(body.pairingEnabled, true);
  });
});

test("GET /v1/identity exposes public identity without the signing secret", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/identity`);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(body.id, identity.id);
    assert.equal(body.fingerprint, identity.fingerprint);
    assert.equal(body.secret, undefined);
  });
});

test("pairing code can be exchanged once for a working token", async () => {
  await withServer(async (baseUrl) => {
    const startResponse = await fetch(`${baseUrl}/v1/pairing/start`, { method: "POST" });
    const startBody = await startResponse.json() as { code: string };
    assert.equal(startResponse.status, 201);

    const completeResponse = await fetch(`${baseUrl}/v1/pairing/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: startBody.code, clientName: "Foundry Test" }),
    });
    const completeBody = await completeResponse.json() as { token: string };
    assert.equal(completeResponse.status, 201);

    const statusResponse = await fetch(`${baseUrl}/v1/pairing/status`, {
      headers: { authorization: `Bearer ${completeBody.token}` },
    });
    const statusBody = await statusResponse.json() as { paired: boolean; clientName: string };
    assert.equal(statusResponse.status, 200);
    assert.equal(statusBody.paired, true);
    assert.equal(statusBody.clientName, "Foundry Test");

    const reuseResponse = await fetch(`${baseUrl}/v1/pairing/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: startBody.code }),
    });
    assert.equal(reuseResponse.status, 401);
  });
});

test("unknown routes return a structured 404", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 404);
    assert.equal(body.error.code, "route_not_found");
  });
});

test("authenticated journal routes validate and delegate to the journal service", async () => {
  const services: BackendServices = {
    journals: {
      async search(input) {
        return {
          sourceId: "foundry:cos",
          query: input.query,
          results: [{ journalId: "j1", journalUuid: "JournalEntry.j1", journalName: "Tser Falls", pageCount: 1, matchedField: "journalName" }],
        };
      },
      async get(journalId) {
        if (journalId !== "j1") return undefined;
        return {
          sourceId: "foundry:cos",
          id: "j1",
          uuid: "JournalEntry.j1",
          name: "Tser Falls",
          pages: [{ id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Overview", type: "text", sort: 0, text: { format: 1, html: "<p>Mist.</p>", plainText: "Mist." } }],
        };
      },
      async getPage(journalId, pageId) {
        if (journalId !== "j1" || pageId !== "p1") return undefined;
        return {
          sourceId: "foundry:cos",
          journal: { id: "j1", uuid: "JournalEntry.j1", name: "Locations & NPCs" },
          page: { id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Tser Falls", type: "text", sort: 0, text: { format: 1, html: "<p>Mist.</p>", plainText: "Mist." } },
        };
      },
    },
  };

  await withServer(async (baseUrl) => {
    const token = await pair(baseUrl);
    const searchResponse = await fetch(`${baseUrl}/v1/journals/search`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: "Tser Falls", limit: 5 }),
    });
    const searchBody = await searchResponse.json() as { results: Array<{ journalId: string }> };
    assert.equal(searchResponse.status, 200);
    assert.equal(searchBody.results[0]?.journalId, "j1");

    const getResponse = await fetch(`${baseUrl}/v1/journals/j1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const getBody = await getResponse.json() as { name: string };
    assert.equal(getResponse.status, 200);
    assert.equal(getBody.name, "Tser Falls");

    const pageResponse = await fetch(`${baseUrl}/v1/journals/j1/pages/p1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const pageBody = await pageResponse.json() as { journal: { name: string }; page: { name: string } };
    assert.equal(pageResponse.status, 200);
    assert.equal(pageBody.journal.name, "Locations & NPCs");
    assert.equal(pageBody.page.name, "Tser Falls");

    const missingResponse = await fetch(`${baseUrl}/v1/journals/missing`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(missingResponse.status, 404);

    const missingPageResponse = await fetch(`${baseUrl}/v1/journals/j1/pages/missing`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(missingPageResponse.status, 404);
  }, services);
});

test("journal routes require authentication and a connected journal service", async () => {
  await withServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/v1/journals/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Tser Falls" }),
    });
    assert.equal(unauthorized.status, 401);

    const token = await pair(baseUrl);
    const unavailable = await fetch(`${baseUrl}/v1/journals/search`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: "Tser Falls" }),
    });
    assert.equal(unavailable.status, 503);
  });
});

test("paired Foundry adapter registers an authenticated live session", async () => {
  await withServer(async (baseUrl) => {
    const token = await pair(baseUrl);
    const webSocket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/adapter");

    const welcome = await new Promise<AdapterWelcomeMessage>((resolve, reject) => {
      webSocket.once("error", reject);
      webSocket.once("open", () => {
        webSocket.send(JSON.stringify({
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
            capabilities: [{
              name: "getWorldSummary",
              mode: "read",
              version: "0.1",
            }],
          },
        }));
      });
      webSocket.once("message", (data) => resolve(JSON.parse(data.toString()) as AdapterWelcomeMessage));
    });

    assert.equal(welcome.kind, "adapter.welcome");
    assert.equal(welcome.backendId, identity.id);

    const adaptersResponse = await fetch(`${baseUrl}/v1/adapters`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const adaptersBody = await adaptersResponse.json() as {
      adapters: Array<{ registration: { sources: Array<{ sourceId: string }> } }>;
    };
    assert.equal(adaptersResponse.status, 200);
    assert.equal(adaptersBody.adapters[0]?.registration.sources[0]?.sourceId, "foundry:cos");

    webSocket.close();
    await new Promise<void>((resolve) => webSocket.once("close", () => resolve()));
  });
});

test("adapter sessions reject an invalid pairing token", async () => {
  await withServer(async (baseUrl) => {
    const webSocket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/adapter");
    const error = await new Promise<{ kind: string; code: string }>((resolve, reject) => {
      webSocket.once("error", reject);
      webSocket.once("open", () => {
        webSocket.send(JSON.stringify({
          kind: "adapter.hello",
          protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
          token: "invalid-token",
          registration: {
            adapterId: "foundry-vtt",
            adapterType: "foundry",
            adapterVersion: "0.1.6",
            protocolVersions: [LOREBRIDGE_PROTOCOL_VERSION],
            sources: [],
            capabilities: [],
          },
        }));
      });
      webSocket.once("message", (data) => resolve(JSON.parse(data.toString()) as { kind: string; code: string }));
    });

    assert.equal(error.kind, "adapter.error");
    assert.equal(error.code, "AUTHENTICATION_FAILED");
    await new Promise<void>((resolve) => webSocket.once("close", () => resolve()));
  });
});

test("adapter session inventory requires authentication", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/adapters`);
    assert.equal(response.status, 401);
  });
});

test("GET /v1/world-summary routes through the authenticated live Foundry adapter", async () => {
  await withServer(async (baseUrl) => {
    const token = await pair(baseUrl);
    const webSocket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/adapter");

    await new Promise<AdapterWelcomeMessage>((resolve, reject) => {
      webSocket.once("error", reject);
      webSocket.once("open", () => {
        webSocket.send(JSON.stringify({
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
            capabilities: [{
              name: "getWorldSummary",
              mode: "read",
              version: "0.1",
            }],
          },
        }));
      });
      webSocket.once("message", (data) => resolve(JSON.parse(data.toString()) as AdapterWelcomeMessage));
    });

    webSocket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as AdapterWelcomeMessage | RequestEnvelope;
      if (message.kind !== "request") return;
      webSocket.send(JSON.stringify(createResponseEnvelope(
        {
          messageId: "message_response",
          correlationId: message.correlationId,
        },
        {
          source: { sourceId: "foundry:cos", adapterType: "foundry" },
          world: { id: "cos", title: "Curse of Strahd", foundryVersion: "14.365" },
          system: { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition", version: "5.3.3" },
          counts: {
            actors: 686,
            scenes: 624,
            journals: 842,
            installedModules: 20,
            activeModules: 20,
          },
        },
      )));
    });

    const response = await fetch(
      `${baseUrl}/v1/world-summary?sourceId=${encodeURIComponent("foundry:cos")}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const body = await response.json() as {
      source: { sourceId: string };
      world: { title: string };
    };
    assert.equal(response.status, 200);
    assert.equal(body.source.sourceId, "foundry:cos");
    assert.equal(body.world.title, "Curse of Strahd");

    webSocket.close();
    await new Promise<void>((resolve) => webSocket.once("close", () => resolve()));
  });
});

test("GET /v1/world-summary reports an unavailable adapter", async () => {
  await withServer(async (baseUrl) => {
    const token = await pair(baseUrl);
    const response = await fetch(
      `${baseUrl}/v1/world-summary?sourceId=${encodeURIComponent("foundry:cos")}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const body = await response.json() as { error: { code: string; retryable: boolean } };
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "adapter_unavailable");
    assert.equal(body.error.retryable, true);
  });
});

test("actor search and retrieval routes through the authenticated Foundry adapter", async () => {
  await withServer(async (baseUrl) => {
    const token = await pair(baseUrl);
    const webSocket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/adapter");

    await new Promise<AdapterWelcomeMessage>((resolve, reject) => {
      webSocket.once("error", reject);
      webSocket.once("open", () => {
        webSocket.send(JSON.stringify({
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
              { name: "searchActors", mode: "read", version: "0.1" },
              { name: "getActor", mode: "read", version: "0.1" },
            ],
          },
        }));
      });
      webSocket.once("message", (data) =>
        resolve(JSON.parse(data.toString()) as AdapterWelcomeMessage));
    });

    webSocket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as AdapterWelcomeMessage | RequestEnvelope;
      if (message.kind !== "request") return;
      const output = message.capability === "searchActors"
        ? {
            sourceId: "foundry:cos",
            query: "Strahd",
            results: [{
              actorId: "actor_strahd",
              actorUuid: "Actor.actor_strahd",
              actorName: "Strahd von Zarovich",
              actorType: "npc",
              matchedField: "actorName",
            }],
          }
        : {
            sourceId: "foundry:cos",
            systemId: "dnd5e",
            id: "actor_strahd",
            uuid: "Actor.actor_strahd",
            name: "Strahd von Zarovich",
            type: "npc",
            description: { plainText: "The vampire lord of Barovia." },
          };
      webSocket.send(JSON.stringify(createResponseEnvelope(
        {
          messageId: "message_actor_response",
          correlationId: message.correlationId,
        },
        output,
      )));
    });

    const searchResponse = await fetch(
      `${baseUrl}/v1/actors/search?sourceId=${encodeURIComponent("foundry:cos")}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: "Strahd", limit: 10 }),
      },
    );
    const search = await searchResponse.json() as {
      results: Array<{ actorId: string; actorUuid: string }>;
    };
    assert.equal(searchResponse.status, 200);
    assert.equal(search.results[0]?.actorUuid, "Actor.actor_strahd");

    const actorResponse = await fetch(
      `${baseUrl}/v1/actors/${encodeURIComponent(search.results[0]?.actorId ?? "")}?sourceId=${encodeURIComponent("foundry:cos")}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const actor = await actorResponse.json() as {
      name: string;
      description: { plainText: string };
    };
    assert.equal(actorResponse.status, 200);
    assert.equal(actor.name, "Strahd von Zarovich");
    assert.equal(actor.description.plainText, "The vampire lord of Barovia.");

    webSocket.close();
    await new Promise<void>((resolve) => webSocket.once("close", () => resolve()));
  });
});

test("POST /v1/journals/search routes through the live Foundry adapter", async () => {
  await withServer(async (baseUrl) => {
    const token = await pair(baseUrl);
    const webSocket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/adapter");

    await new Promise<AdapterWelcomeMessage>((resolve, reject) => {
      webSocket.once("error", reject);
      webSocket.once("open", () => {
        webSocket.send(JSON.stringify({
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
            capabilities: [{
              name: "searchJournals",
              mode: "read",
              version: "0.1",
            }],
          },
        }));
      });
      webSocket.once("message", (data) => resolve(JSON.parse(data.toString()) as AdapterWelcomeMessage));
    });

    webSocket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as AdapterWelcomeMessage | RequestEnvelope<{
        query: string;
        limit?: number;
      }>;
      if (message.kind !== "request") return;
      assert.equal(message.capability, "searchJournals");
      assert.deepEqual(message.input, { query: "Tser Falls", limit: 10 });
      webSocket.send(JSON.stringify(createResponseEnvelope(
        {
          messageId: "message_search_response",
          correlationId: message.correlationId,
        },
        {
          sourceId: "foundry:cos",
          query: message.input.query,
          results: [{
            journalId: "journal_locations",
            journalUuid: "JournalEntry.journal_locations",
            journalName: "Locations & NPCs",
            pageCount: 30,
            matchedPageId: "page_tser_falls",
            matchedPageName: "Tser Falls",
            matchedField: "pageName",
          }],
        },
      )));
    });

    const discoveryResponse = await fetch(`${baseUrl}/v1`);
    const discovery = await discoveryResponse.json() as { capabilities: string[] };
    assert.ok(discovery.capabilities.includes("searchJournals"));

    const response = await fetch(
      `${baseUrl}/v1/journals/search?sourceId=${encodeURIComponent("foundry:cos")}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: "Tser Falls", limit: 10 }),
      },
    );
    const body = await response.json() as {
      sourceId: string;
      results: Array<{ journalName: string; matchedPageName?: string }>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.sourceId, "foundry:cos");
    assert.equal(body.results[0]?.journalName, "Locations & NPCs");
    assert.equal(body.results[0]?.matchedPageName, "Tser Falls");

    webSocket.close();
    await new Promise<void>((resolve) => webSocket.once("close", () => resolve()));
  });
});

test("GET /v1/journals/:journalId/pages/:pageId routes through the live Foundry adapter", async () => {
  await withServer(async (baseUrl) => {
    const token = await pair(baseUrl);
    const webSocket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/adapter");

    await new Promise<AdapterWelcomeMessage>((resolve, reject) => {
      webSocket.once("error", reject);
      webSocket.once("open", () => {
        webSocket.send(JSON.stringify({
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
            capabilities: [{
              name: "getJournalPage",
              mode: "read",
              version: "0.1",
            }],
          },
        }));
      });
      webSocket.once("message", (data) => resolve(JSON.parse(data.toString()) as AdapterWelcomeMessage));
    });

    webSocket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as AdapterWelcomeMessage | RequestEnvelope<{
        journalId: string;
        pageId: string;
      }>;
      if (message.kind !== "request") return;
      assert.equal(message.capability, "getJournalPage");
      assert.deepEqual(message.input, {
        journalId: "journal_locations",
        pageId: "page_tser_falls",
      });
      webSocket.send(JSON.stringify(createResponseEnvelope(
        {
          messageId: "message_page_response",
          correlationId: message.correlationId,
        },
        {
          sourceId: "foundry:cos",
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
        },
      )));
    });

    const discoveryResponse = await fetch(`${baseUrl}/v1`);
    const discovery = await discoveryResponse.json() as { capabilities: string[] };
    assert.ok(discovery.capabilities.includes("getJournalPage"));

    const response = await fetch(
      `${baseUrl}/v1/journals/journal_locations/pages/page_tser_falls?sourceId=${encodeURIComponent("foundry:cos")}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const body = await response.json() as {
      sourceId: string;
      journal: { name: string };
      page: { name: string; text?: { plainText: string } };
    };
    assert.equal(response.status, 200);
    assert.equal(body.sourceId, "foundry:cos");
    assert.equal(body.journal.name, "Locations & NPCs");
    assert.equal(body.page.name, "Tser Falls");
    assert.equal(body.page.text?.plainText, "The falls plunge into mist.");

    webSocket.close();
    await new Promise<void>((resolve) => webSocket.once("close", () => resolve()));
  });
});
