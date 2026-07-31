import assert from "node:assert/strict";
import test from "node:test";
import {
  validateGetActorInput,
  validateGetActorOutput,
  validateSearchActorsInput,
  validateSearchActorsOutput,
} from "../dist/capabilities/actors.js";

test("validates bounded actor search input", () => {
  assert.equal(validateSearchActorsInput({ query: "Strahd", limit: 10 }).valid, true);
  assert.equal(validateSearchActorsInput({ query: "Strahd", types: ["npc"] }).valid, true);
  assert.equal(validateSearchActorsInput({ query: "", limit: 51 }).valid, false);
  assert.equal(validateSearchActorsInput({ query: "Strahd", types: [] }).valid, false);
});

test("validates actor search and focused retrieval output", () => {
  assert.equal(validateSearchActorsOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "Strahd",
    results: [{
      actorId: "a1",
      actorUuid: "Actor.a1",
      actorName: "Strahd von Zarovich",
      actorType: "npc",
      matchedField: "actorName",
    }],
    hiddenCount: 0,
  }).valid, true);
  assert.equal(validateSearchActorsOutput({
    sourceId: "foundry:cos",
    query: "Strahd",
    results: [],
  }).valid, false, "missing sourceName should be invalid");

  assert.equal(validateGetActorInput({ actorId: "Actor.a1" }).valid, true);
  assert.equal(validateGetActorOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    systemId: "dnd5e",
    id: "a1",
    uuid: "Actor.a1",
    name: "Strahd von Zarovich",
    type: "npc",
    description: { plainText: "The vampire lord of Barovia." },
  }).valid, true);
  assert.equal(validateGetActorOutput({
    sourceId: "foundry:cos",
    systemId: "dnd5e",
    id: "a1",
    uuid: "Actor.a1",
    name: "Strahd von Zarovich",
    type: "npc",
  }).valid, false, "missing sourceName should be invalid");
});
