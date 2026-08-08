import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { searchCampaign } from "../src/capabilities/search-campaign.js";
import { resetSearchCandidateLifecycleForTests } from "../src/capabilities/search-candidates.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
const originalConfig = Object.getOwnPropertyDescriptor(globalThis, "CONFIG");

afterEach(() => {
  originalGame ? Object.defineProperty(globalThis, "game", originalGame) : Reflect.deleteProperty(globalThis, "game");
  originalConfig ? Object.defineProperty(globalThis, "CONFIG", originalConfig) : Reflect.deleteProperty(globalThis, "CONFIG");
  resetSearchCandidateLifecycleForTests();
});

function collection<T extends { id: string; name: string }>(values: T[]) {
  return Object.assign(values, {
    get: (id: string) => values.find((value) => value.id === id),
    search: ({ query = "" }: { query?: string }) => values.filter((value) => value.name.toLowerCase().includes(query.toLowerCase())),
  });
}

test("candidate discovery cannot bypass Context Profile type, visibility, or maxDocs boundaries", () => {
  const actors = collection([
    { id: "hidden", uuid: "Actor.hidden", name: "Strahd", type: "npc", system: {}, ownership: { default: 0 } },
    { id: "visible", uuid: "Actor.visible", name: "Strahd Ally", type: "npc", system: {}, ownership: { default: 2 } },
    { id: "visible-2", uuid: "Actor.visible2", name: "Strahd Witness", type: "npc", system: {}, ownership: { default: 2 } },
  ]);
  const journals = collection([{ id: "j1", uuid: "JournalEntry.j1", name: "Strahd Secrets", pages: [], ownership: { default: 2 } }]);
  const scenes = collection([{ id: "s1", uuid: "Scene.s1", name: "Strahd Castle", active: false, navigation: true, ownership: { default: 2 } }]);
  const profiles = JSON.stringify([{
    id: "players",
    name: "Players",
    allowedDocTypes: ["actor"],
    visibilityMode: "player-safe",
    maxDocs: 1,
  }]);

  Object.defineProperty(globalThis, "CONFIG", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { id: "gm", name: "GM", isGM: true },
      world: { id: "cos", title: "Curse of Strahd" },
      system: { id: "dnd5e", title: "D&D 5e", version: "5.3.3" },
      actors,
      journal: journals,
      scenes,
      settings: { get: (_module: string, key: string) => key === "contextProfiles" ? profiles : key === "activeContextProfileId" ? "players" : undefined },
    },
  });

  const result = searchCampaign({ query: "Strahd", limit: 20 });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.documentType, "actor");
  assert.equal(result.results[0]?.actorUuid, "Actor.visible");
  assert.ok(result.hiddenCount >= 1);
});
