import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getJournal, searchJournals } from "../src/capabilities/journals.js";
import { LoreBridgeCapabilityError } from "../src/capabilities/errors.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame);
  else Reflect.deleteProperty(globalThis, "game");
});

function setGame(isGM = true): void {
  const pages = [
    { id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Overview", type: "text", sort: 0, text: { content: "<p>The road reaches Tser Falls beneath the mist.</p>", format: 1 } },
    { id: "p2", uuid: "JournalEntry.j1.JournalEntryPage.p2", name: "Map", type: "image", sort: 10, src: "worlds/cos/tser-falls.webp" },
  ];
  const journals = [
    { id: "j1", uuid: "JournalEntry.j1", name: "Tser Falls", pages },
    { id: "j2", uuid: "JournalEntry.j2", name: "Travel Notes", pages: [{ id: "p3", uuid: "JournalEntry.j2.JournalEntryPage.p3", name: "Old Svalich Road", type: "text", sort: 0, text: { content: "<p>A bridge crosses the river.</p>", format: 1 } }] },
  ];
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { isGM, name: isGM ? "GM" : "Player" },
      world: { id: "cos", title: "Curse of Strahd" },
      journal: Object.assign(journals, { get: (id: string) => journals.find((journal) => journal.id === id) }),
    },
  });
}

test("searches names and page text with bounded normalized results", () => {
  setGame();
  const byName = searchJournals({ query: "Tser Falls", limit: 5 });
  assert.equal(byName.results.length, 1);
  assert.equal(byName.results[0]?.matchedField, "journalName");

  const byText = searchJournals({ query: "beneath the mist" });
  assert.equal(byText.results[0]?.journalId, "j1");
  assert.equal(byText.results[0]?.matchedField, "pageText");
  assert.match(byText.results[0]?.excerpt ?? "", /beneath the mist/);
});

test("retrieves and serializes a journal without leaking Foundry documents", () => {
  setGame();
  const journal = getJournal({ journalId: "JournalEntry.j1" });
  assert.equal(journal.name, "Tser Falls");
  assert.equal(journal.pages.length, 2);
  assert.equal(journal.pages[0]?.text?.plainText, "The road reaches Tser Falls beneath the mist.");
  assert.equal(journal.pages[1]?.src, "worlds/cos/tser-falls.webp");
  assert.doesNotThrow(() => JSON.stringify(journal));
});

test("returns safe structured errors", () => {
  setGame(false);
  assert.throws(() => searchJournals({ query: "Tser" }), (error: unknown) => error instanceof LoreBridgeCapabilityError && error.code === "NOT_AUTHORIZED");
  setGame();
  assert.throws(() => getJournal({ journalId: "missing" }), (error: unknown) => error instanceof LoreBridgeCapabilityError && error.code === "NOT_FOUND");
});
