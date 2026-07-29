import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createLoreBridgeServer } from "./app.js";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import type { BackendServices } from "./journal-service.js";

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
