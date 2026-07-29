import assert from "node:assert/strict";
import test from "node:test";

import {
  LOREBRIDGE_PROTOCOL_VERSION,
  validateAdapterHelloMessage,
} from "../dist/index.js";

const registration = {
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
};

test("validates an authenticated adapter hello", () => {
  const result = validateAdapterHelloMessage({
    kind: "adapter.hello",
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    token: "signed-pairing-token",
    registration,
  });

  assert.equal(result.valid, true);
  assert.equal(result.value?.registration.sources[0]?.sourceId, "foundry:cos");
});

test("rejects an adapter hello without credentials", () => {
  const result = validateAdapterHelloMessage({
    kind: "adapter.hello",
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    token: "",
    registration,
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /token/);
});
