/**
 * Tests for GET /v1/backup/github/restore/scenes
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createLoreBridgeServer } from "./app.js";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import type { BackendServices } from "./journal-service.js";

const BASE_CONFIG: BackendConfig = {
  host: "127.0.0.1",
  port: 0,
  pairingEnabled: true,
  pairingTtlSeconds: 300,
  dataDir: ".lorebridge-test",
};

const IDENTITY: BackendIdentity = {
  id: "lb_test_restore",
  secret: "test-secret-restore",
  createdAt: "2026-08-04T00:00:00.000Z",
  fingerprint: "test:fingerprint:restore",
};

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  config: Partial<BackendConfig> = {},
): Promise<void> {
  const merged: BackendConfig = { ...BASE_CONFIG, ...config };
  const services: BackendServices = {};
  const server = createLoreBridgeServer(merged, IDENTITY, services);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

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

describe("GET /v1/backup/github/restore/scenes — authentication", () => {
  it("returns 401 without a token", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/backup/github/restore/scenes?folderName=Barovia`);
      assert.equal(res.status, 401);
    });
  });

  it("returns 401 with an invalid token", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/backup/github/restore/scenes?folderName=Barovia`, {
        headers: { authorization: "Bearer not-valid" },
      });
      assert.equal(res.status, 401);
    });
  });
});

describe("GET /v1/backup/github/restore/scenes — GitHub not configured", () => {
  it("returns 503 when GitHub is not configured", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/restore/scenes?folderName=Barovia`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "not_configured");
    });
  });
});

describe("GET /v1/backup/github/restore/scenes — input validation", () => {
  it("returns 400 when folderName is missing", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/restore/scenes`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "invalid_request");
    });
  });

  it("returns 400 when folderName is empty string", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/restore/scenes?folderName=`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
    });
  });
});
