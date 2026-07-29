import assert from "node:assert/strict";
import test from "node:test";
import {
  GET_JOURNAL_CAPABILITY,
  SEARCH_JOURNALS_CAPABILITY,
  validateGetJournalInput,
  validateGetJournalOutput,
  validateSearchJournalsInput,
  validateSearchJournalsOutput,
} from "../dist/capabilities.js";

test("exports canonical journal capabilities", () => {
  assert.equal(SEARCH_JOURNALS_CAPABILITY, "searchJournals");
  assert.equal(GET_JOURNAL_CAPABILITY, "getJournal");
});

test("validates bounded journal search input", () => {
  assert.equal(validateSearchJournalsInput({ query: "Tser Falls", limit: 10 }).valid, true);
  assert.equal(validateSearchJournalsInput({ query: " ", limit: 0 }).valid, false);
  assert.equal(validateSearchJournalsInput({ query: "Tser", limit: 51 }).valid, false);
});

test("validates journal output contracts", () => {
  assert.equal(validateSearchJournalsOutput({
    sourceId: "foundry:cos",
    query: "Tser Falls",
    results: [{ journalId: "j1", journalUuid: "JournalEntry.j1", journalName: "Tser Falls", pageCount: 1, matchedField: "journalName" }],
  }).valid, true);
  assert.equal(validateGetJournalInput({ journalId: "j1" }).valid, true);
  assert.equal(validateGetJournalOutput({
    sourceId: "foundry:cos", id: "j1", uuid: "JournalEntry.j1", name: "Tser Falls",
    pages: [{ id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Overview", type: "text", sort: 0, text: { format: 1, html: "<p>Mist.</p>", plainText: "Mist." } }],
  }).valid, true);
});
