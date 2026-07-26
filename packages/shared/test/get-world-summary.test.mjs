import assert from "node:assert/strict";
import test from "node:test";

import {
  GET_WORLD_SUMMARY_CAPABILITY,
  GET_WORLD_SUMMARY_DECLARATION,
  validateGetWorldSummaryOutput
} from "../dist/capabilities.js";

const validSummary = {
  source: {
    sourceId: "foundry:curse-of-strahd",
    adapterType: "foundry"
  },
  world: {
    id: "curse-of-strahd",
    title: "Curse of Strahd",
    foundryVersion: "14.0.0"
  },
  system: {
    id: "dnd5e",
    title: "Dungeons & Dragons Fifth Edition",
    version: "5.0.0"
  },
  counts: {
    actors: 42,
    scenes: 18,
    journals: 73,
    installedModules: 25,
    activeModules: 8
  }
};

test("exports the canonical getWorldSummary capability", () => {
  assert.equal(GET_WORLD_SUMMARY_CAPABILITY, "getWorldSummary");
  assert.deepEqual(GET_WORLD_SUMMARY_DECLARATION, {
    name: "getWorldSummary",
    mode: "read",
    version: "0.1"
  });
});

test("accepts a normalized world summary", () => {
  const result = validateGetWorldSummaryOutput(validSummary);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects malformed world summary output", () => {
  const result = validateGetWorldSummaryOutput({
    ...validSummary,
    world: { id: "", title: "", foundryVersion: null },
    counts: { actors: -1 }
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 7);
});
