import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getActor, searchActors } from "../src/capabilities/actors.js";
import { LoreBridgeCapabilityError } from "../src/capabilities/errors.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame);
  else Reflect.deleteProperty(globalThis, "game");
});

function setGame(isGM = true): void {
  const actors = [
    {
      id: "a1",
      uuid: "Actor.a1",
      name: "Strahd von Zarovich",
      type: "npc",
      img: "worlds/cos/strahd.webp",
      folder: { id: "f1", name: "Villains" },
      system: {
        details: {
          biography: {
            value: "<p>The vampire lord rules Barovia from Castle Ravenloft.</p>",
          },
        },
      },
    },
    {
      id: "a2",
      uuid: "Actor.a2",
      name: "Ireena Kolyana",
      type: "npc",
      system: { details: { biography: { value: "<p>A brave Barovian noble.</p>" } } },
    },
    {
      id: "a3",
      uuid: "Actor.a3",
      name: "Ezmerelda d'Avenir",
      type: "character",
      system: { biography: "<p>A monster hunter tracking the vampire lord.</p>" },
    },
  ];
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { isGM, name: isGM ? "GM" : "Player" },
      world: { id: "cos", title: "Curse of Strahd" },
      system: { id: "dnd5e", title: "D&D 5e", version: "5.3.3" },
      actors: Object.assign(actors, {
        get: (id: string) => actors.find((actor) => actor.id === id),
      }),
    },
  });
}

test("searches actor names and descriptions with optional type filtering", () => {
  setGame();
  const byName = searchActors({ query: "Strahd", limit: 10 });
  assert.equal(byName.results[0]?.actorId, "a1");
  assert.equal(byName.results[0]?.actorUuid, "Actor.a1");
  assert.equal(byName.results[0]?.matchedField, "actorName");
  assert.equal(byName.sourceId, "foundry:cos");
  assert.equal(byName.sourceName, "Curse of Strahd");

  const byDescription = searchActors({ query: "vampire lord", types: ["character"] });
  assert.equal(byDescription.results.length, 1);
  assert.equal(byDescription.results[0]?.actorId, "a3");
  assert.equal(byDescription.results[0]?.matchedField, "description");
});

test("retrieves a focused actor without raw system or embedded data", () => {
  setGame();
  const actor = getActor({ actorId: "Actor.a1" });
  assert.equal(actor.name, "Strahd von Zarovich");
  assert.equal(actor.uuid, "Actor.a1");
  assert.equal(actor.sourceId, "foundry:cos");
  assert.equal(actor.sourceName, "Curse of Strahd");
  assert.equal(actor.folder?.name, "Villains");
  assert.equal(actor.description?.plainText, "The vampire lord rules Barovia from Castle Ravenloft.");
  assert.equal("system" in actor, false);
  assert.equal("items" in actor, false);
  assert.doesNotThrow(() => JSON.stringify(actor));
});

test("returns safe actor capability errors", () => {
  setGame(false);
  assert.throws(
    () => searchActors({ query: "Strahd" }),
    (error: unknown) =>
      error instanceof LoreBridgeCapabilityError && error.code === "NOT_AUTHORIZED",
  );
  setGame();
  assert.throws(
    () => getActor({ actorId: "missing" }),
    (error: unknown) =>
      error instanceof LoreBridgeCapabilityError && error.code === "NOT_FOUND",
  );
});
