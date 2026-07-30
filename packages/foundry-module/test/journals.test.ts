import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getJournal, getJournalPage, searchJournals } from "../src/capabilities/journals.js";
import { LoreBridgeCapabilityError } from "../src/capabilities/errors.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame);
  else Reflect.deleteProperty(globalThis, "game");
});

function setGame(isGM = true): void {
  const pageValues = [
    { id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Overview", type: "text", sort: 0, text: { content: "<p>The road reaches Tser Falls beneath the mist.</p>", format: 1 } },
    { id: "p2", uuid: "JournalEntry.j1.JournalEntryPage.p2", name: "Map", type: "image", sort: 10, src: "worlds/cos/tser-falls.webp" },
  ];
  const pages = Object.assign(pageValues, {
    get: (id: string) => pageValues.find((page) => page.id === id),
  });
  const travelPageValues = [{ id: "p3", uuid: "JournalEntry.j2.JournalEntryPage.p3", name: "Old Svalich Road", type: "text", sort: 0, text: { content: "<p>A bridge crosses the river.</p>", format: 1 } }];
  const travelPages = Object.assign(travelPageValues, {
    get: (id: string) => travelPageValues.find((page) => page.id === id),
  });
  const journals = [
    { id: "j1", uuid: "JournalEntry.j1", name: "Tser Falls", pages },
    { id: "j2", uuid: "JournalEntry.j2", name: "Travel Notes", pages: travelPages },
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
  assert.equal(byName.sourceId, "foundry:cos");
  assert.equal(byName.sourceName, "Curse of Strahd");

  const byPage = searchJournals({ query: "Old Svalich Road" });
  assert.equal(byPage.results[0]?.matchedField, "pageName");
  assert.equal(byPage.results[0]?.matchedPageId, "p3");
  assert.equal(byPage.results[0]?.matchedPageUuid, "JournalEntry.j2.JournalEntryPage.p3");

  const byText = searchJournals({ query: "beneath the mist" });
  assert.equal(byText.results[0]?.journalId, "j1");
  assert.equal(byText.results[0]?.matchedField, "pageText");
  assert.equal(byText.results[0]?.matchedPageUuid, "JournalEntry.j1.JournalEntryPage.p1");
  assert.match(byText.results[0]?.excerpt ?? "", /beneath the mist/);
});

test("retrieves only the selected journal page with its parent reference", () => {
  setGame();
  const result = getJournalPage({ journalId: "j1", pageId: "p1" });
  assert.equal(result.journal.name, "Tser Falls");
  assert.equal(result.journal.uuid, "JournalEntry.j1");
  assert.equal(result.page.name, "Overview");
  assert.equal(result.page.uuid, "JournalEntry.j1.JournalEntryPage.p1");
  assert.equal(result.page.text?.plainText, "The road reaches Tser Falls beneath the mist.");
  assert.equal(result.sourceId, "foundry:cos");
  assert.equal(result.sourceName, "Curse of Strahd");
  assert.equal("pages" in result, false);
});

test("retrieves and serializes a journal without leaking Foundry documents", () => {
  setGame();
  const journal = getJournal({ journalId: "JournalEntry.j1" });
  assert.equal(journal.name, "Tser Falls");
  assert.equal(journal.sourceId, "foundry:cos");
  assert.equal(journal.sourceName, "Curse of Strahd");
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
  assert.throws(() => getJournalPage({ journalId: "j1", pageId: "missing" }), (error: unknown) => error instanceof LoreBridgeCapabilityError && error.code === "NOT_FOUND");
});
