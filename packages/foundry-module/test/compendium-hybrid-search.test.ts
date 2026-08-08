import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { searchCompendium } from "../src/capabilities/compendium.js";
import { resetSearchCandidateLifecycleForTests } from "../src/capabilities/search-candidates.js";

const globals = new Map(["CONFIG", "fromUuid", "game"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
  resetSearchCandidateLifecycleForTests();
});

function setGlobal(key: string, value: unknown): void { Object.defineProperty(globalThis, key, { configurable: true, value }); }

function pack(id: string, label: string, entryId: string) {
  const entry = { _id: entryId, name: "Sun Sword", type: "Item" };
  const index = Object.assign([entry], { size: 1, get: (candidate: string) => candidate === entryId ? entry : undefined });
  return {
    metadata: { id, label, type: "Item" },
    index,
    search: () => [entry],
    getDocument: async () => null,
    getIndex: async () => index,
  };
}

test("Spotlight compendium candidates still honor LoreBridge pack exclusions", async () => {
  const allowed = pack("world.allowed", "Allowed", "ok");
  const excluded = pack("world.secret", "Secret", "hidden");
  const allowedUuid = "Compendium.world.allowed.Item.ok";
  const excludedUuid = "Compendium.world.secret.Item.hidden";
  setGlobal("CONFIG", { SpotlightOmnisearch: { INDEX: [
    { data: { uuid: allowedUuid, documentName: "Item" }, match: () => true },
    { data: { uuid: excludedUuid, documentName: "Item" }, match: () => true },
  ], SearchTerm: class {}, rebuildIndex: () => undefined } });
  setGlobal("fromUuid", async (uuid: string) => ({ id: uuid.endsWith("ok") ? "ok" : "hidden", uuid, name: "Sun Sword" }));
  setGlobal("game", {
    user: { id: "gm", name: "GM", isGM: true },
    world: { id: "cos", title: "Curse of Strahd" },
    packs: Object.assign([allowed, excluded], { size: 2, get: (id: string) => id === allowed.metadata.id ? allowed : id === excluded.metadata.id ? excluded : undefined }),
    settings: { get: (_module: string, key: string) => key === "excludedCompendiums" ? "world.secret" : undefined },
  });

  const result = await searchCompendium({ query: "Sun" });
  assert.deepEqual(result.results.map((entry) => entry.entryUuid), [allowedUuid]);
});
