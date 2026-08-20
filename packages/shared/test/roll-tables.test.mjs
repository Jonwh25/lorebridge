import assert from "node:assert/strict";
import test from "node:test";
import {
  SEARCH_ROLL_TABLES_CAPABILITY,
  validateSearchRollTablesInput,
  validateSearchRollTablesOutput,
} from "../dist/capabilities.js";

test("exports canonical roll table search capability", () => {
  assert.equal(SEARCH_ROLL_TABLES_CAPABILITY, "searchRollTables");
});

test("validates search roll tables input", () => {
  assert.equal(validateSearchRollTablesInput({ query: "wild magic" }).valid, true);
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", limit: 10 }).valid, true);
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", mode: "gm" }).valid, true);
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", mode: "player" }).valid, true);
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", folderId: "f1" }).valid, true);
  assert.equal(validateSearchRollTablesInput({ query: " " }).valid, false, "whitespace-only query is invalid");
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", limit: 51 }).valid, false, "limit > 50 is invalid");
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", limit: 0 }).valid, false, "limit 0 is invalid");
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", mode: "admin" }).valid, false, "unknown mode is invalid");
  assert.equal(validateSearchRollTablesInput({ query: "wild magic", folderId: "" }).valid, false, "empty folderId is invalid");
  assert.equal(validateSearchRollTablesInput({}).valid, false, "missing query is invalid");
  assert.equal(validateSearchRollTablesInput(null).valid, false, "null is invalid");
});

test("validates search roll tables output — name match", () => {
  assert.equal(validateSearchRollTablesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "wild magic",
    results: [{
      tableId: "t1",
      tableUuid: "RollTable.t1",
      tableName: "Wild Magic Surge",
      matchedField: "tableName",
    }],
    hiddenCount: 0,
  }).valid, true);
});

test("validates search roll tables output — description match with folder", () => {
  assert.equal(validateSearchRollTablesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "encounter",
    results: [{
      tableId: "t2",
      tableUuid: "RollTable.t2",
      tableName: "Wilderness Events",
      img: "icons/tables/wilderness.png",
      folderId: "f1",
      folderName: "Encounters",
      description: "…random encounter table for the Svalich Woods…",
      matchedField: "description",
    }],
    hiddenCount: 0,
  }).valid, true);
});

test("validates search roll tables output — empty results", () => {
  assert.equal(validateSearchRollTablesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "nothing",
    results: [],
    hiddenCount: 0,
  }).valid, true, "empty results array is valid");
});

test("rejects search roll tables output with missing required fields", () => {
  assert.equal(validateSearchRollTablesOutput({
    sourceId: "foundry:cos",
    query: "wild magic",
    results: [],
    hiddenCount: 0,
  }).valid, false, "missing sourceName is invalid");
  assert.equal(validateSearchRollTablesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "wild magic",
    results: [{ tableId: "t1", tableName: "Wild Magic Surge", matchedField: "tableName" }],
    hiddenCount: 0,
  }).valid, false, "result missing tableUuid is invalid");
  assert.equal(validateSearchRollTablesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "wild magic",
    results: [{ tableId: "t1", tableUuid: "RollTable.t1", tableName: "Wild Magic Surge", matchedField: "badField" }],
    hiddenCount: 0,
  }).valid, false, "invalid matchedField is invalid");
  assert.equal(validateSearchRollTablesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "wild magic",
    results: [],
  }).valid, false, "missing hiddenCount is invalid");
});
