import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { exportForEmbedding } from "../src/capabilities/export-for-embedding.js";
import { LoreBridgeCapabilityError } from "../src/capabilities/errors.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame);
  else Reflect.deleteProperty(globalThis, "game");
});

function setGame(isGM = true): void {
  const pageValues = [
    {
      id: "p1",
      uuid: "JournalEntry.j1.JournalEntryPage.p1",
      name: "Overview",
      type: "text",
      sort: 0,
      text: { content: "<p>Tser Falls plunges into mist.</p>", format: 1 },
    },
    {
      id: "p2",
      uuid: "JournalEntry.j1.JournalEntryPage.p2",
      name: "Map",
      type: "image",
      sort: 10,
      text: { content: "", format: 1 },
    },
  ];
  const journals = [{ id: "j1", uuid: "JournalEntry.j1", name: "Tser Falls", pages: pageValues }];
  const actors = [
    {
      id: "a1",
      uuid: "Actor.a1",
      name: "Strahd von Zarovich",
      system: { details: { biography: { value: "<p>Vampire lord of Barovia.</p>" } } },
    },
    {
      id: "a2",
      uuid: "Actor.a2",
      name: "Vistani Wanderer",
      system: {},
    },
  ];
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { isGM, name: isGM ? "GM" : "Player" },
      world: { id: "cos", title: "Curse of Strahd" },
      journal: journals,
      actors,
    },
  });
}

test("exportForEmbedding emits journal pages with non-empty text", () => {
  setGame();
  const out = exportForEmbedding({});
  assert.equal(out.sourceId, "foundry:cos");
  assert.equal(out.sourceName, "Curse of Strahd");

  const journalItems = out.items.filter((i) => i.documentType === "journal");
  // Only page p1 has non-empty text; p2 (image with empty content) should be skipped.
  assert.equal(journalItems.length, 1);
  assert.equal(journalItems[0]?.uuid, "JournalEntry.j1.JournalEntryPage.p1");
  assert.equal(journalItems[0]?.name, "Tser Falls / Overview");
  assert.ok(journalItems[0]?.text.includes("Tser Falls"));
});

test("exportForEmbedding emits actors, falling back to name when no bio", () => {
  setGame();
  const out = exportForEmbedding({});
  const actorItems = out.items.filter((i) => i.documentType === "actor");
  assert.equal(actorItems.length, 2);

  const strahd = actorItems.find((i) => i.uuid === "Actor.a1");
  assert.ok(strahd);
  assert.equal(strahd.name, "Strahd von Zarovich");
  assert.ok(strahd.text.includes("Vampire lord"));

  const vistani = actorItems.find((i) => i.uuid === "Actor.a2");
  assert.ok(vistani);
  assert.equal(vistani.name, "Vistani Wanderer");
});

test("exportForEmbedding respects types filter — journal only", () => {
  setGame();
  const out = exportForEmbedding({ types: ["journal"] });
  assert.ok(out.items.every((i) => i.documentType === "journal"));
});

test("exportForEmbedding respects types filter — actor only", () => {
  setGame();
  const out = exportForEmbedding({ types: ["actor"] });
  assert.ok(out.items.every((i) => i.documentType === "actor"));
  assert.equal(out.items.length, 2);
});

test("exportForEmbedding throws when not GM", () => {
  setGame(false);
  assert.throws(() => exportForEmbedding({}), LoreBridgeCapabilityError);
});
