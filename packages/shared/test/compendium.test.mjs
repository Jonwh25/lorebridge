import assert from "node:assert/strict";
import test from "node:test";
import {
  validateListCompendiumsInput,
  validateListCompendiumsOutput,
  validateSearchCompendiumInput,
  validateSearchCompendiumOutput,
  validateGetCompendiumEntryInput,
  validateGetCompendiumEntryOutput,
} from "../dist/capabilities.js";

// --- listCompendiums input ---

test("validates empty list compendiums input", () => {
  const result = validateListCompendiumsInput({});
  assert.equal(result.valid, true);
  assert.equal(result.value?.documentType, undefined);
});

test("validates list compendiums input with documentType", () => {
  const result = validateListCompendiumsInput({ documentType: "Item" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.documentType, "Item");
});

test("rejects list compendiums input with empty documentType", () => {
  const result = validateListCompendiumsInput({ documentType: "" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("documentType")));
});

// --- listCompendiums output ---

const validListOutput = {
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
  compendiums: [
    { packId: "dnd5e.spells", label: "SRD Spells", documentType: "Item", entryCount: 312 },
    { packId: "dnd5e.monsters", label: "SRD Monsters", documentType: "Actor", entryCount: 200 },
  ],
};

test("validates a valid list compendiums output", () => {
  const result = validateListCompendiumsOutput(validListOutput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.compendiums.length, 2);
  assert.equal(result.value?.compendiums[0]?.packId, "dnd5e.spells");
});

test("validates list compendiums output with empty compendiums", () => {
  const result = validateListCompendiumsOutput({ ...validListOutput, compendiums: [] });
  assert.equal(result.valid, true);
  assert.equal(result.value?.compendiums.length, 0);
});

test("rejects list compendiums output with missing sourceId", () => {
  const result = validateListCompendiumsOutput({ ...validListOutput, sourceId: "" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("sourceId")));
});

test("rejects list compendiums output with negative entryCount", () => {
  const bad = { ...validListOutput, compendiums: [{ ...validListOutput.compendiums[0], entryCount: -1 }] };
  const result = validateListCompendiumsOutput(bad);
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("entryCount")));
});

// --- searchCompendium input ---

test("validates a minimal search compendium input", () => {
  const result = validateSearchCompendiumInput({ query: "fireball" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.query, "fireball");
  assert.equal(result.value?.packId, undefined);
  assert.equal(result.value?.limit, undefined);
});

test("validates search compendium input with all options", () => {
  const result = validateSearchCompendiumInput({ query: "spell", packId: "dnd5e.spells", documentType: "Item", limit: 10 });
  assert.equal(result.valid, true);
  assert.equal(result.value?.packId, "dnd5e.spells");
  assert.equal(result.value?.limit, 10);
});

test("rejects search compendium input with empty query", () => {
  const result = validateSearchCompendiumInput({ query: "" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("query")));
});

test("rejects search compendium input with limit out of range", () => {
  const result = validateSearchCompendiumInput({ query: "sword", limit: 51 });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("limit")));
});

// --- searchCompendium output ---

const validSearchOutput = {
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
  query: "fireball",
  results: [
    {
      packId: "dnd5e.spells",
      packLabel: "SRD Spells",
      entryId: "abc123",
      entryUuid: "Compendium.dnd5e.spells.Item.abc123",
      entryName: "Fireball",
      documentType: "Item",
      img: "icons/magic/fire/fireball.webp",
    },
  ],
};

test("validates a valid search compendium output", () => {
  const result = validateSearchCompendiumOutput(validSearchOutput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.results.length, 1);
  assert.equal(result.value?.results[0]?.entryName, "Fireball");
});

test("validates search compendium output with no results", () => {
  const result = validateSearchCompendiumOutput({ ...validSearchOutput, results: [] });
  assert.equal(result.valid, true);
  assert.equal(result.value?.results.length, 0);
});

test("rejects search compendium output with missing entryUuid", () => {
  const bad = { ...validSearchOutput, results: [{ ...validSearchOutput.results[0], entryUuid: "" }] };
  const result = validateSearchCompendiumOutput(bad);
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("entryUuid")));
});

// --- getCompendiumEntry input ---

test("validates a valid get compendium entry input", () => {
  const result = validateGetCompendiumEntryInput({ packId: "dnd5e.spells", entryId: "abc123" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.packId, "dnd5e.spells");
  assert.equal(result.value?.entryId, "abc123");
});

test("rejects get compendium entry input with missing entryId", () => {
  const result = validateGetCompendiumEntryInput({ packId: "dnd5e.spells" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("entryId")));
});

test("rejects get compendium entry input with empty packId", () => {
  const result = validateGetCompendiumEntryInput({ packId: "", entryId: "abc123" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("packId")));
});

// --- getCompendiumEntry output ---

const validEntryOutput = {
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
  packId: "dnd5e.spells",
  packLabel: "SRD Spells",
  entryId: "abc123",
  entryUuid: "Compendium.dnd5e.spells.Item.abc123",
  entryName: "Fireball",
  documentType: "Item",
  img: "icons/magic/fire/fireball.webp",
};

test("validates a valid get compendium entry output", () => {
  const result = validateGetCompendiumEntryOutput(validEntryOutput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.entryName, "Fireball");
  assert.equal(result.value?.entryUuid, "Compendium.dnd5e.spells.Item.abc123");
});

test("validates get compendium entry output without img", () => {
  const { img: _, ...withoutImg } = validEntryOutput;
  const result = validateGetCompendiumEntryOutput(withoutImg);
  assert.equal(result.valid, true);
  assert.equal(result.value?.img, undefined);
});

test("rejects get compendium entry output with missing packLabel", () => {
  const result = validateGetCompendiumEntryOutput({ ...validEntryOutput, packLabel: "" });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("packLabel")));
});
