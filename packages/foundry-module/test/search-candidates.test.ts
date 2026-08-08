import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { collectCompendiumCandidateUuids, collectJournalCandidateUuids, collectWorldCandidateUuids, resetSearchCandidateLifecycleForTests, spotlightApiAvailable } from "../src/capabilities/search-candidates.js";

const originals = new Map(["CONFIG", "fromUuid", "fromUuidSync"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
  resetSearchCandidateLifecycleForTests();
});
function setGlobal(key: string, value: unknown): void { Object.defineProperty(globalThis, key, { configurable: true, value }); }

test("detects Spotlight and falls back while an empty index builds once", async () => {
  let builds = 0;
  setGlobal("CONFIG", { SpotlightOmnisearch: { INDEX: [], SearchTerm: class {}, rebuildIndex: () => { builds++; } } });
  const collection = Object.assign([], { search: () => [] });
  assert.equal(spotlightApiAvailable(), true);
  collectWorldCandidateUuids("Strahd", "Actor", collection);
  collectWorldCandidateUuids("Strahd", "Actor", collection);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(builds, 1);
});

test("rejects executable and disallowed terms and live-resolves allowed UUIDs", () => {
  const liveActor = { id: "a1", uuid: "Actor.a1", name: "Strahd" };
  setGlobal("CONFIG", { SpotlightOmnisearch: { INDEX: [
    { data: { uuid: "Macro.m1", documentName: "Macro" }, match: () => true, onClick: () => undefined },
    { data: { uuid: "Actor.a1", documentName: "Actor" }, match: () => true, onClick: () => undefined },
    { data: { uuid: "Actor.deleted", documentName: "Actor" }, match: () => true },
  ], SearchTerm: class {}, rebuildIndex: () => undefined } });
  setGlobal("fromUuidSync", (uuid: string) => uuid === liveActor.uuid ? liveActor : null);
  const collection = Object.assign([liveActor], { search: () => [] });
  assert.deepEqual([...collectWorldCandidateUuids("Strahd", "Actor", collection)], ["Actor.a1"]);
});

test("rejects stale renamed terms and deduplicates native candidates", () => {
  const renamed = { id: "a1", uuid: "Actor.a1", name: "Count Zarovich" };
  const native = { id: "a2", uuid: "Actor.a2", name: "Strahd Echo" };
  setGlobal("CONFIG", { SpotlightOmnisearch: { INDEX: [{ data: { uuid: "Actor.a1", documentName: "Actor" }, match: () => true }], SearchTerm: class {}, rebuildIndex: () => undefined } });
  setGlobal("fromUuidSync", () => renamed);
  const collection = Object.assign([renamed, native], { search: () => [native, native] });
  assert.deepEqual([...collectWorldCandidateUuids("Strahd", "Actor", collection)], ["Actor.a2"]);
});

test("uses native search when Spotlight is unavailable", () => {
  setGlobal("CONFIG", { SpotlightOmnisearch: { INDEX: [] } });
  const native = { id: "s1", uuid: "Scene.s1", name: "Tser Falls" };
  const collection = Object.assign([native], { search: () => [native] });
  assert.equal(spotlightApiAvailable(), false);
  assert.deepEqual([...collectWorldCandidateUuids("Tser", "Scene", collection)], ["Scene.s1"]);
});

test("live-resolves compendium candidates and rejects deleted or renamed entries", async () => {
  const current = { id: "i1", uuid: "Compendium.dnd5e.items.Item.i1", name: "Sun Sword" };
  setGlobal("CONFIG", { SpotlightOmnisearch: { INDEX: [
    { data: { uuid: current.uuid, documentName: "Item" }, match: () => true },
    { data: { uuid: "Compendium.dnd5e.items.Item.deleted", documentName: "Item" }, match: () => true },
    { data: { uuid: "Compendium.dnd5e.items.Item.renamed", documentName: "Item" }, match: () => true },
  ], SearchTerm: class {}, rebuildIndex: () => undefined } });
  setGlobal("fromUuid", async (uuid: string) => {
    if (uuid === current.uuid) return current;
    if (uuid.endsWith("renamed")) return { id: "renamed", uuid, name: "Dawn Blade" };
    return null;
  });
  const candidates = await collectCompendiumCandidateUuids("Sun", new Set(["Item"]));
  assert.deepEqual([...candidates], [current.uuid]);
});

test("accepts a live journal-page heading candidate without trusting stale term data", () => {
  const page = {
    id: "p1",
    uuid: "JournalEntry.j1.JournalEntryPage.p1",
    name: "Overview",
    text: { content: "<h2>Hidden Staircase</h2><p>Current content.</p>" },
  };
  setGlobal("CONFIG", { SpotlightOmnisearch: { INDEX: [
    { data: { uuid: page.uuid, documentName: "JournalEntryPage" }, match: () => true },
  ], SearchTerm: class {}, rebuildIndex: () => undefined } });
  setGlobal("fromUuidSync", () => page);
  const journals = Object.assign([], { search: () => [] });
  assert.deepEqual([...collectJournalCandidateUuids("Hidden Staircase", journals)], ["JournalEntry.j1"]);
  assert.deepEqual([...collectJournalCandidateUuids("Stale Heading", journals)], []);
});
