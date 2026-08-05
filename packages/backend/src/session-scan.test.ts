import assert from "node:assert/strict";
import test from "node:test";
import { extractSessionEntities } from "./session-scan.js";

test("returns empty array for empty text", () => {
  const result = extractSessionEntities("", []);
  assert.deepEqual(result, []);
});

test("extracts a proper noun not in existing names", () => {
  const result = extractSessionEntities(
    "The party met Varek Thornwood in the tavern.",
    [],
  );
  const names = result.map((e) => e.name);
  assert.ok(names.includes("Varek Thornwood"), `expected "Varek Thornwood" in ${JSON.stringify(names)}`);
});

test("filters out names already in existingNames (case-insensitive)", () => {
  const result = extractSessionEntities(
    "Varek Thornwood greeted the heroes in Millhaven.",
    ["varek thornwood"],
  );
  const names = result.map((e) => e.name);
  assert.ok(!names.includes("Varek Thornwood"), "should not include an existing name");
  assert.ok(names.includes("Millhaven"), `expected "Millhaven" in ${JSON.stringify(names)}`);
});

test("filters out single common words even when capitalized at sentence start", () => {
  const result = extractSessionEntities(
    "The heroes explored the dungeon. They found gold.",
    [],
  );
  const names = result.map((e) => e.name);
  assert.ok(!names.includes("The"), "should not include 'The'");
  assert.ok(!names.includes("They"), "should not include 'They'");
});

test("attaches context sentence to each entity", () => {
  const sentence = "Varek Thornwood greeted the party at the city gates.";
  const result = extractSessionEntities(sentence, []);
  const entity = result.find((e) => e.name === "Varek Thornwood");
  assert.ok(entity, "entity not found");
  assert.ok(entity.context.includes("greeted"), "context should contain the source sentence");
});

test("truncates long context sentences to 130 characters plus ellipsis", () => {
  const long = "Varek Thornwood " + "x".repeat(200) + " end of sentence.";
  const result = extractSessionEntities(long, []);
  const entity = result.find((e) => e.name === "Varek Thornwood");
  assert.ok(entity, "entity not found");
  assert.ok(entity.context.endsWith("…"), "context should be truncated with ellipsis");
  assert.ok(entity.context.length <= 134, "context should be at most 131 chars + ellipsis");
});

test("deduplicates repeated mentions and captures first-occurrence casing", () => {
  const text = "Varek Thornwood arrived. Later, Varek Thornwood left.";
  const result = extractSessionEntities(text, []);
  const matches = result.filter((e) => e.name.toLowerCase() === "varek thornwood");
  assert.equal(matches.length, 1, "should deduplicate repeated mentions");
});

test("filters single-character or two-character words", () => {
  const result = extractSessionEntities("Go North quickly.", []);
  const names = result.map((e) => e.name);
  assert.ok(!names.includes("Go"), "short words filtered");
});

test("handles multi-sentence text and extracts entities from each sentence", () => {
  const text = "Lady Aldris ruled the kingdom. Baron Kessix challenged her claim.";
  const result = extractSessionEntities(text, []);
  const names = result.map((e) => e.name);
  assert.ok(names.includes("Lady Aldris") || names.includes("Aldris"), "Lady Aldris or Aldris expected");
  assert.ok(names.includes("Baron Kessix") || names.includes("Kessix"), "Baron Kessix or Kessix expected");
});
