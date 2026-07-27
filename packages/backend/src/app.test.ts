import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createLoreBridgeServer } from "./app.js";
import type { BackendConfig } from "./config.js";

const config: BackendConfig = {
  host: "127.0.0.1",
  port: 3210,
  pairingEnabled: false,
  pairingTtlSeconds: 300,
};

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createLoreBridgeServer(config);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("GET /health reports service health without caching", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.status, "ok");
    assert.equal(body.service, "lorebridge-backend");
    assert.equal(body.pairingEnabled, false);
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
