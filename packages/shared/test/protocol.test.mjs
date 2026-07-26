import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  LOREBRIDGE_PROTOCOL_VERSION,
  validateAdapterRegistration,
  validateProtocolMessage
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const contents = await readFile(join(here, "fixtures", name), "utf8");
  return JSON.parse(contents);
}

test("exports protocol version 0.1", () => {
  assert.equal(LOREBRIDGE_PROTOCOL_VERSION, "0.1");
});

test("accepts a valid request envelope", async () => {
  const result = validateProtocolMessage(await readFixture("valid-request.json"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects an invalid request envelope", async () => {
  const result = validateProtocolMessage(await readFixture("invalid-request.json"));
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 5);
});

test("accepts a basic Foundry adapter registration", () => {
  const result = validateAdapterRegistration({
    adapterId: "foundry-v14-test",
    adapterType: "foundry",
    adapterVersion: "0.1.0",
    protocolVersions: ["0.1"],
    sources: [],
    capabilities: [
      {
        name: "getWorldSummary",
        mode: "read",
        version: "0.1"
      }
    ]
  });

  assert.equal(result.valid, true);
});
