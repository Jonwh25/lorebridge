import assert from "node:assert/strict";
import test from "node:test";
import {
  GET_JOURNAL_CAPABILITY,
  GET_JOURNAL_PAGE_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  validateGetJournalInput,
  validateGetJournalOutput,
  validateGetJournalPageInput,
  validateGetJournalPageOutput,
  validateSearchJournalsInput,
  validateSearchJournalsOutput,
} from "../dist/capabilities.js";

test("exports canonical journal capabilities", () => {
  assert.equal(SEARCH_JOURNALS_CAPABILITY, "searchJournals");
  assert.equal(GET_JOURNAL_CAPABILITY, "getJournal");
  assert.equal(GET_JOURNAL_PAGE_CAPABILITY, "getJournalPage");
});

test("validates focused journal-page retrieval contracts", () => {
  assert.equal(validateGetJournalPageInput({ journalId: "j1", pageId: "p1" }).valid, true);
  assert.equal(validateGetJournalPageInput({ journalId: "j1", pageId: "" }).valid, false);
  assert.equal(validateGetJournalPageOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    journal: { id: "j1", uuid: "JournalEntry.j1", name: "Locations & NPCs" },
    page: {
      id: "p1",
      uuid: "JournalEntry.j1.JournalEntryPage.p1",
      name: "Tser Falls",
      type: "text",
      sort: 0,
      text: { format: 1, html: "<p>Mist.</p>", plainText: "Mist." },
    },
  }).valid, true);
  assert.equal(validateGetJournalPageOutput({
    sourceId: "foundry:cos",
    journal: { id: "j1", uuid: "JournalEntry.j1", name: "Locations & NPCs" },
    page: { id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Tser Falls", type: "text", sort: 0 },
  }).valid, false, "missing sourceName should be invalid");
});

test("validates bounded journal search input", () => {
  assert.equal(validateSearchJournalsInput({ query: "Tser Falls", limit: 10 }).valid, true);
  assert.equal(validateSearchJournalsInput({ query: " ", limit: 0 }).valid, false);
  assert.equal(validateSearchJournalsInput({ query: "Tser", limit: 51 }).valid, false);
});

test("validates journal output contracts", () => {
  assert.equal(validateSearchJournalsOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "Tser Falls",
    results: [{ journalId: "j1", journalUuid: "JournalEntry.j1", journalName: "Tser Falls", pageCount: 1, matchedField: "journalName" }],
  }).valid, true);
  assert.equal(validateSearchJournalsOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "Tser",
    results: [{ journalId: "j1", journalUuid: "JournalEntry.j1", journalName: "Tser Falls", pageCount: 2, matchedPageId: "p1", matchedPageUuid: "JournalEntry.j1.JournalEntryPage.p1", matchedPageName: "Overview", matchedField: "pageName" }],
  }).valid, true, "matchedPageUuid is valid when present");
  assert.equal(validateSearchJournalsOutput({
    sourceId: "foundry:cos",
    query: "Tser Falls",
    results: [],
  }).valid, false, "missing sourceName should be invalid");
  assert.equal(validateGetJournalInput({ journalId: "j1" }).valid, true);
  assert.equal(validateGetJournalOutput({
    sourceId: "foundry:cos", sourceName: "Curse of Strahd", id: "j1", uuid: "JournalEntry.j1", name: "Tser Falls",
    pages: [{ id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Overview", type: "text", sort: 0, text: { format: 1, html: "<p>Mist.</p>", plainText: "Mist." } }],
  }).valid, true);
  assert.equal(validateGetJournalOutput({
    sourceId: "foundry:cos", id: "j1", uuid: "JournalEntry.j1", name: "Tser Falls", pages: [],
  }).valid, false, "missing sourceName should be invalid");
});
