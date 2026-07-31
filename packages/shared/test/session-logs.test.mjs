import assert from "node:assert/strict";
import test from "node:test";
import {
  validateSearchSessionLogsInput,
  validateSearchSessionLogsOutput,
  validateGetSessionLogInput,
  validateGetSessionLogOutput,
} from "../dist/capabilities.js";

// --- searchSessionLogs input ---

test("validates a minimal search session logs input", () => {
  const result = validateSearchSessionLogsInput({ query: "Strahd" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.query, "Strahd");
  assert.equal(result.value?.limit, undefined);
});

test("validates search session logs input with limit", () => {
  const result = validateSearchSessionLogsInput({ query: "tavern", limit: 5 });
  assert.equal(result.valid, true);
  assert.equal(result.value?.limit, 5);
});

test("rejects search session logs input with empty query", () => {
  const result = validateSearchSessionLogsInput({ query: "" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("query")));
});

test("rejects search session logs input with limit out of range", () => {
  const result = validateSearchSessionLogsInput({ query: "test", limit: 51 });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("limit")));
});

// --- searchSessionLogs output ---

const validSearchOutput = {
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
  query: "Strahd",
  folderName: "Session Logs",
  results: [
    {
      journalId: "abc",
      journalUuid: "JournalEntry.abc",
      journalName: "Session 5",
      pageId: "page1",
      pageUuid: "JournalEntry.abc.JournalEntryPage.page1",
      pageName: "Session 5 - 2024-01-15",
      sessionNumber: 5,
      matchedField: "content",
      excerpt: "...Strahd appeared at the crossroads...",
    },
  ],
};

test("validates a valid search session logs output", () => {
  const result = validateSearchSessionLogsOutput(validSearchOutput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.results.length, 1);
  assert.equal(result.value?.results[0]?.sessionNumber, 5);
  assert.equal(result.value?.folderName, "Session Logs");
});

test("validates search session logs output with no results", () => {
  const result = validateSearchSessionLogsOutput({ ...validSearchOutput, results: [] });
  assert.equal(result.valid, true);
  assert.equal(result.value?.results.length, 0);
});

test("rejects search session logs output with invalid matchedField", () => {
  const bad = { ...validSearchOutput, results: [{ ...validSearchOutput.results[0], matchedField: "title" }] };
  const result = validateSearchSessionLogsOutput(bad);
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("matchedField")));
});

// --- getSessionLog input ---

test("validates a valid get session log input", () => {
  const result = validateGetSessionLogInput({ journalId: "abc", pageId: "page1" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.journalId, "abc");
  assert.equal(result.value?.pageId, "page1");
});

test("rejects get session log input with missing pageId", () => {
  const result = validateGetSessionLogInput({ journalId: "abc" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("pageId")));
});

// --- getSessionLog output ---

const validPageOutput = {
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
  journalId: "abc",
  journalUuid: "JournalEntry.abc",
  journalName: "Session 5",
  pageId: "page1",
  pageUuid: "JournalEntry.abc.JournalEntryPage.page1",
  pageName: "Session 5 - 2024-01-15",
  sessionNumber: 5,
  plainText: "The party arrived at the village of Barovia...",
};

test("validates a valid get session log output", () => {
  const result = validateGetSessionLogOutput(validPageOutput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.sessionNumber, 5);
  assert.equal(result.value?.plainText, "The party arrived at the village of Barovia...");
});

test("validates get session log output without session number", () => {
  const { sessionNumber: _, ...withoutNumber } = validPageOutput;
  const result = validateGetSessionLogOutput(withoutNumber);
  assert.equal(result.valid, true);
  assert.equal(result.value?.sessionNumber, undefined);
});

test("rejects get session log output with missing plainText", () => {
  const { plainText: _, ...withoutText } = validPageOutput;
  const result = validateGetSessionLogOutput(withoutText);
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("plainText")));
});
