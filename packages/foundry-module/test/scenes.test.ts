import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getActiveScene, getScene, searchScenes } from "../src/capabilities/scenes.js";
import { LoreBridgeCapabilityError } from "../src/capabilities/errors.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame);
  else Reflect.deleteProperty(globalThis, "game");
});

function makeTokens(items: Array<{ id: string; name: string; actorId?: string; actor?: { uuid: string } }>) {
  return Object.assign(items, { size: items.length });
}

function makeNotes(items: Array<{ id: string; label?: string; entryId?: string; pageId?: string; entry?: { id: string; uuid: string; name: string }; page?: { id: string; uuid: string; name: string } }>) {
  return Object.assign(items, { size: items.length });
}

function setGame(isGM = true): void {
  const scenes = [
    {
      id: "s1",
      uuid: "Scene.s1",
      name: "Tser Falls",
      active: true,
      navigation: true,
      navName: "Tser Falls",
      thumb: "worlds/cos/thumbs/tser-falls.webp",
      firstLevel: { background: { src: "worlds/cos/tser-falls.webp" } },
      width: 4000,
      height: 3000,
      folder: { id: "f1", name: "Barovia" },
      journal: { id: "j1", uuid: "JournalEntry.j1", name: "Locations & NPCs" },
      journalEntryPage: { id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Tser Falls" },
      tokens: makeTokens([
        { id: "t1", name: "Strahd von Zarovich", actorId: "a1", actor: { uuid: "Actor.a1" } },
        { id: "t2", name: "Guard", actorId: "a2" },
      ]),
      notes: makeNotes([
        { id: "n1", label: "The Falls", entryId: "j1", pageId: "p1", entry: { id: "j1", uuid: "JournalEntry.j1", name: "Locations & NPCs" }, page: { id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Tser Falls" } },
      ]),
    },
    {
      id: "s2",
      uuid: "Scene.s2",
      name: "Village of Barovia",
      active: false,
      navigation: true,
      firstLevel: { background: { src: "worlds/cos/barovia.webp" } },
      width: 3000,
      height: 2000,
      tokens: makeTokens([]),
      notes: makeNotes([]),
    },
  ];
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { isGM, name: isGM ? "GM" : "Player" },
      world: { id: "cos", title: "Curse of Strahd" },
      scenes: Object.assign(scenes, { size: scenes.length, active: scenes.find((s) => s.active) ?? null, get: (id: string) => scenes.find((s) => s.id === id) }),
    },
  });
}

test("searches scene names and returns match metadata", () => {
  setGame();
  const results = searchScenes({ query: "Tser", limit: 5 });
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0]?.sceneId, "s1");
  assert.equal(results.results[0]?.sceneUuid, "Scene.s1");
  assert.equal(results.results[0]?.sceneName, "Tser Falls");
  assert.equal(results.results[0]?.active, true);
  assert.equal(results.results[0]?.navigation, true);
  assert.equal(results.results[0]?.matchedField, "sceneName");
  assert.equal(results.sourceId, "foundry:cos");
  assert.equal(results.sourceName, "Curse of Strahd");
});

test("returns multiple results sorted by exactness then name", () => {
  setGame();
  const results = searchScenes({ query: "barovia" });
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0]?.sceneName, "Village of Barovia");
});

test("retrieves a scene with linked journal, tokens, and notes", () => {
  setGame();
  const scene = getScene({ sceneId: "s1" });
  assert.equal(scene.id, "s1");
  assert.equal(scene.uuid, "Scene.s1");
  assert.equal(scene.name, "Tser Falls");
  assert.equal(scene.active, true);
  assert.equal(scene.navigation, true);
  assert.equal(scene.sourceId, "foundry:cos");
  assert.equal(scene.sourceName, "Curse of Strahd");
  assert.equal(scene.background?.src, "worlds/cos/tser-falls.webp");
  assert.equal(scene.width, 4000);
  assert.equal(scene.height, 3000);
  assert.equal(scene.folder?.name, "Barovia");
  assert.equal(scene.linkedJournal?.id, "j1");
  assert.equal(scene.linkedJournal?.uuid, "JournalEntry.j1");
  assert.equal(scene.linkedJournal?.name, "Locations & NPCs");
  assert.equal(scene.linkedJournal?.pageId, "p1");
  assert.equal(scene.linkedJournal?.pageUuid, "JournalEntry.j1.JournalEntryPage.p1");
  assert.equal(scene.linkedJournal?.pageName, "Tser Falls");
  assert.equal(scene.tokens?.length, 2);
  assert.equal(scene.tokens?.[0]?.actorId, "a1");
  assert.equal(scene.tokens?.[0]?.actorUuid, "Actor.a1");
  assert.equal(scene.notes?.length, 1);
  assert.equal(scene.notes?.[0]?.label, "The Falls");
  assert.equal(scene.notes?.[0]?.journalId, "j1");
  assert.equal(scene.notes?.[0]?.pageUuid, "JournalEntry.j1.JournalEntryPage.p1");
  assert.doesNotThrow(() => JSON.stringify(scene));
});

test("retrieves a scene without optional fields", () => {
  setGame();
  const scene = getScene({ sceneId: "s2" });
  assert.equal(scene.name, "Village of Barovia");
  assert.equal(scene.active, false);
  assert.equal(scene.tokens, undefined);
  assert.equal(scene.notes, undefined);
  assert.equal(scene.linkedJournal, undefined);
  assert.equal(scene.folder, undefined);
  assert.doesNotThrow(() => JSON.stringify(scene));
});

test("accepts a UUID-prefixed sceneId", () => {
  setGame();
  const scene = getScene({ sceneId: "Scene.s1" });
  assert.equal(scene.id, "s1");
});

test("returns safe capability errors", () => {
  setGame(false);
  assert.throws(() => searchScenes({ query: "Tser" }), (e: unknown) => e instanceof LoreBridgeCapabilityError && e.code === "NOT_AUTHORIZED");
  setGame();
  assert.throws(() => getScene({ sceneId: "missing" }), (e: unknown) => e instanceof LoreBridgeCapabilityError && e.code === "NOT_FOUND");
});

test("getActiveScene returns the active scene", () => {
  setGame();
  const scene = getActiveScene({});
  assert.equal(scene.id, "s1");
  assert.equal(scene.uuid, "Scene.s1");
  assert.equal(scene.name, "Tser Falls");
  assert.equal(scene.active, true);
  assert.equal(scene.sourceId, "foundry:cos");
  assert.equal(scene.sourceName, "Curse of Strahd");
  assert.equal(scene.background?.src, "worlds/cos/tser-falls.webp");
  assert.equal(scene.tokens?.length, 2);
  assert.equal(scene.notes?.length, 1);
});

test("getActiveScene throws NOT_FOUND when no scene is active", () => {
  setGame();
  // Make no scene active
  (game.scenes as unknown as { active: null }).active = null;
  assert.throws(() => getActiveScene({}), (e: unknown) => e instanceof LoreBridgeCapabilityError && e.code === "NOT_FOUND");
});

test("getActiveScene throws NOT_AUTHORIZED for non-GM", () => {
  setGame(false);
  assert.throws(() => getActiveScene({}), (e: unknown) => e instanceof LoreBridgeCapabilityError && e.code === "NOT_AUTHORIZED");
});
