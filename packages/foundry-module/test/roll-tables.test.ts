import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { searchRollTables } from "../src/capabilities/roll-tables.js";
import { LoreBridgeCapabilityError } from "../src/capabilities/errors.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame);
  else Reflect.deleteProperty(globalThis, "game");
});

function makeTables(items: Array<Record<string, unknown>>) {
  return Object.assign(items, { size: items.length, search: undefined });
}

function setGame(isGM = true): void {
  const tables = makeTables([
    {
      id: "t1",
      uuid: "RollTable.t1",
      name: "Wild Magic Surge",
      description: "A table of chaotic magical events.",
      img: "icons/magic/wild.png",
      folder: { id: "f1", name: "Magic Tables" },
      ownership: { default: 0 },
      formula: "1d100",
      replacement: true,
      displayRoll: true,
      results: Object.assign([], { size: 0 }),
    },
    {
      id: "t2",
      uuid: "RollTable.t2",
      name: "Wilderness Encounters",
      description: "Random encounter table for the Svalich Woods.",
      folder: null,
      ownership: { default: 2 },
      formula: "1d20",
      replacement: true,
      displayRoll: true,
      results: Object.assign([], { size: 0 }),
    },
  ]);

  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { isGM, name: isGM ? "GM" : "Player" },
      world: { id: "cos", title: "Curse of Strahd" },
      tables,
    },
  });
}

test("searches roll table names and returns match metadata", () => {
  setGame();
  const results = searchRollTables({ query: "Wild Magic", limit: 5 });
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0]?.tableId, "t1");
  assert.equal(results.results[0]?.tableUuid, "RollTable.t1");
  assert.equal(results.results[0]?.tableName, "Wild Magic Surge");
  assert.equal(results.results[0]?.matchedField, "tableName");
  assert.equal(results.results[0]?.folderId, "f1");
  assert.equal(results.results[0]?.folderName, "Magic Tables");
  assert.equal(results.results[0]?.img, "icons/magic/wild.png");
  assert.equal(results.sourceId, "foundry:cos");
  assert.equal(results.sourceName, "Curse of Strahd");
});

test("searches roll table descriptions and includes excerpt", () => {
  setGame();
  const results = searchRollTables({ query: "Svalich", limit: 5 });
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0]?.tableId, "t2");
  assert.equal(results.results[0]?.matchedField, "description");
  assert.ok(results.results[0]?.description?.includes("Svalich"));
});

test("player mode hides tables with default ownership below observer", () => {
  setGame();
  const results = searchRollTables({ query: "Wild Magic", mode: "player" });
  assert.equal(results.results.length, 0);
  assert.equal(results.hiddenCount, 1);
});

test("folderId filter scopes results to a single folder", () => {
  setGame();
  const all = searchRollTables({ query: "a" });
  assert.ok(all.results.length >= 1);
  const filtered = searchRollTables({ query: "a", folderId: "f1" });
  assert.ok(filtered.results.every((r) => r.folderId === "f1"));
});

test("returns safe capability error when not GM", () => {
  setGame(false);
  assert.throws(
    () => searchRollTables({ query: "wild" }),
    (err) => err instanceof LoreBridgeCapabilityError && err.code === "NOT_AUTHORIZED",
  );
});

test("returns safe capability error when tables collection unavailable", () => {
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { isGM: true, name: "GM" },
      world: { id: "cos", title: "Curse of Strahd" },
      tables: null,
    },
  });
  assert.throws(
    () => searchRollTables({ query: "wild" }),
    (err) => err instanceof LoreBridgeCapabilityError && err.code === "ADAPTER_UNAVAILABLE",
  );
});
