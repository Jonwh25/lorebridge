import assert from "node:assert/strict";
import test from "node:test";
import {
  validateSearchItemsInput,
  validateSearchItemsOutput,
  validateGetActorInventoryInput,
  validateGetActorInventoryOutput,
} from "../dist/capabilities.js";

// --- searchItems input ---

test("validates a minimal search items input", () => {
  const result = validateSearchItemsInput({ query: "longsword" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.query, "longsword");
  assert.equal(result.value?.limit, undefined);
  assert.equal(result.value?.types, undefined);
  assert.equal(result.value?.mode, undefined);
});

test("validates search items input with all optional fields", () => {
  const result = validateSearchItemsInput({ query: "sword", limit: 5, types: ["weapon"], mode: "player" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.limit, 5);
  assert.deepEqual(result.value?.types, ["weapon"]);
  assert.equal(result.value?.mode, "player");
});

test("rejects search items input with empty query", () => {
  const result = validateSearchItemsInput({ query: "  " });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("query")));
});

test("rejects search items input with invalid mode", () => {
  const result = validateSearchItemsInput({ query: "sword", mode: "admin" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("mode")));
});

test("rejects search items input with limit out of range", () => {
  const result = validateSearchItemsInput({ query: "sword", limit: 0 });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("limit")));
});

// --- searchItems output ---

const validSearchOutput = {
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
  query: "longsword",
  results: [
    { itemId: "abc", itemUuid: "Item.abc", itemName: "Longsword", itemType: "weapon", matchedField: "itemName" },
  ],
  hiddenCount: 0,
};

test("validates a valid search items output", () => {
  const result = validateSearchItemsOutput(validSearchOutput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.results.length, 1);
  assert.equal(result.value?.hiddenCount, 0);
});

test("rejects search items output with missing results array", () => {
  const result = validateSearchItemsOutput({ ...validSearchOutput, results: undefined });
  assert.equal(result.valid, false);
});

// --- getActorInventory input ---

test("validates a minimal get actor inventory input", () => {
  const result = validateGetActorInventoryInput({ actorId: "Actor.abc123" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.actorId, "Actor.abc123");
  assert.equal(result.value?.mode, undefined);
});

test("rejects get actor inventory input with empty actorId", () => {
  const result = validateGetActorInventoryInput({ actorId: "" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("actorId")));
});

// --- getActorInventory output ---

const validInventoryOutput = {
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
  actorId: "abc123",
  actorUuid: "Actor.abc123",
  actorName: "Strahd von Zarovich",
  items: [
    { id: "item1", uuid: "Item.item1", name: "Longsword +1", type: "weapon", quantity: 1, rarity: "uncommon", identified: true },
  ],
};

test("validates a valid get actor inventory output", () => {
  const result = validateGetActorInventoryOutput(validInventoryOutput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.actorName, "Strahd von Zarovich");
  assert.equal(result.value?.items.length, 1);
  assert.equal(result.value?.items[0]?.rarity, "uncommon");
});

test("validates get actor inventory output with empty items", () => {
  const result = validateGetActorInventoryOutput({ ...validInventoryOutput, items: [] });
  assert.equal(result.valid, true);
  assert.equal(result.value?.items.length, 0);
});

test("rejects get actor inventory output with missing actorName", () => {
  const result = validateGetActorInventoryOutput({ ...validInventoryOutput, actorName: "" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("actorName")));
});
