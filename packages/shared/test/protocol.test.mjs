import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  LOREBRIDGE_CAPABILITIES,
  LOREBRIDGE_EVENTS,
  LOREBRIDGE_PROTOCOL_VERSION,
  createErrorEnvelope,
  createEventEnvelope,
  createRequestEnvelope,
  createResponseEnvelope,
  validateAdapterRegistration,
  validateProtocolMessage
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const metadata = {
  messageId: "msg_test",
  correlationId: "corr_test",
  timestamp: "2026-07-27T17:00:00.000Z"
};

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
        name: LOREBRIDGE_CAPABILITIES.getWorldSummary,
        mode: "read",
        version: "0.1"
      }
    ]
  });

  assert.equal(result.valid, true);
});

test("creates a canonical request envelope", () => {
  const envelope = createRequestEnvelope(
    metadata,
    "foundry-world-test",
    LOREBRIDGE_CAPABILITIES.getWorldSummary,
    { includeActors: false }
  );

  assert.equal(envelope.kind, "request");
  assert.equal(envelope.protocolVersion, LOREBRIDGE_PROTOCOL_VERSION);
  assert.equal(envelope.capability, "getWorldSummary");
  assert.equal(validateProtocolMessage(envelope).valid, true);
});

test("creates canonical response and error envelopes", () => {
  const response = createResponseEnvelope(metadata, { worldName: "Barovia" });
  const error = createErrorEnvelope(metadata, "NOT_AUTHORIZED", "GM approval is required.");

  assert.equal(validateProtocolMessage(response).valid, true);
  assert.equal(validateProtocolMessage(error).valid, true);
  assert.equal(error.error.retryable, false);
});

test("creates a canonical progress event", () => {
  const event = createEventEnvelope(
    "msg_event",
    "backend-test",
    LOREBRIDGE_EVENTS.progress,
    { percent: 50 },
    metadata.timestamp
  );

  assert.equal(event.event, "progress");
  assert.equal(validateProtocolMessage(event).valid, true);
});
