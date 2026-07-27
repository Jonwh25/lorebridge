import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
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
  createdAt: "2026-07-27T00:00:00.000Z",
  fingerprint: "test:fingerprint",
};

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createLoreBridgeServer(config, identity);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
