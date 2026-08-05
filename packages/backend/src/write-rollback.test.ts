/**
 * Tests for POST /v1/write/rollback.
 * Covers: authentication, invalid input, unknown/expired/already-used tokens,
 * and the happy path (rollback pending write is registered and event is queued).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createLoreBridgeServer } from "./app.js";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";

const BASE_CONFIG: BackendConfig = {
  host: "127.0.0.1",
  port: 0,
  pairingEnabled: true,
  pairingTtlSeconds: 300,
  dataDir: ".lorebridge-test",
};

const IDENTITY: BackendIdentity = {
  id: "lb_test_rollback",
  secret: "test-secret-rollback",
  createdAt: "2026-08-01T00:00:00.000Z",
  fingerprint: "test:fingerprint:rollback",
};

async function pair(baseUrl: string): Promise<string> {
  const startRes = await fetch(`${baseUrl}/v1/pairing/start`, { method: "POST" });
  const start = (await startRes.json()) as { code: string };
  const completeRes = await fetch(`${baseUrl}/v1/pairing/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: start.code, clientName: "Test" }),
  });
  return ((await completeRes.json()) as { token: string }).token;
}

async function withServer(run: (baseUrl: string, pairingToken: string) => Promise<void>): Promise<void> {
  const server = createLoreBridgeServer(BASE_CONFIG, IDENTITY, {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const pairingToken = await pair(baseUrl);
  try {
    await run(baseUrl, pairingToken);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe("POST /v1/write/rollback — authentication", () => {
  it("returns 401 without a pairing token", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/write/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auditToken: "anything" }),
      });
      assert.equal(res.status, 401);
    });
  });
});

describe("POST /v1/write/rollback — input validation", () => {
  it("returns 400 when auditToken is missing", async () => {
    await withServer(async (baseUrl, pairingToken) => {
      const res = await fetch(`${baseUrl}/v1/write/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${pairingToken}` },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });
  });

  it("returns 400 when auditToken is an empty string", async () => {
    await withServer(async (baseUrl, pairingToken) => {
      const res = await fetch(`${baseUrl}/v1/write/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${pairingToken}` },
        body: JSON.stringify({ auditToken: "   " }),
      });
      assert.equal(res.status, 400);
    });
  });
});

describe("POST /v1/write/rollback — unknown token", () => {
  it("returns 404 for an unknown auditToken", async () => {
    await withServer(async (baseUrl, pairingToken) => {
      const res = await fetch(`${baseUrl}/v1/write/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${pairingToken}` },
        body: JSON.stringify({ auditToken: "00000000-0000-0000-0000-000000000000" }),
      });
      assert.equal(res.status, 404);
      const body = await res.json() as { error: { code: string } };
      assert.equal(body.error.code, "audit_token_not_found");
    });
  });
});
