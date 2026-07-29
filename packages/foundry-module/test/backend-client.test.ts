import assert from "node:assert/strict";
import test from "node:test";

import { createBackendRequestUrl } from "../src/backend-client.js";

test("preserves a reverse-proxy prefix for backend requests", () => {
  assert.equal(
    createBackendRequestUrl(
      "https://foundry.example/lorebridge-api/",
      "/health",
    ).toString(),
    "https://foundry.example/lorebridge-api/health",
  );
  assert.equal(
    createBackendRequestUrl(
      "https://foundry.example/lorebridge-api",
      "/v1/identity",
    ).toString(),
    "https://foundry.example/lorebridge-api/v1/identity",
  );
});

test("rejects an empty backend URL", () => {
  assert.throws(
    () => createBackendRequestUrl(" ", "/health"),
    /Configure the LoreBridge Backend URL/,
  );
});
