import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getRelatedDocuments } from "../src/capabilities/related-documents.js";
import { listCompendiums, searchCompendium } from "../src/capabilities/compendium.js";
import { getContextProfiles, makeProfile, saveContextProfiles } from "../src/capabilities/context-profile.js";
import { resetSearchCandidateLifecycleForTests } from "../src/capabilities/search-candidates.js";

// ---------------------------------------------------------------------------
// Global save/restore
// ---------------------------------------------------------------------------

const savedDescriptors = new Map(
  ["game", "CONFIG", "fromUuid"].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
);

afterEach(() => {
  for (const [key, desc] of savedDescriptors) {
    desc ? Object.defineProperty(globalThis, key, desc) : Reflect.deleteProperty(globalThis, key);
  }
  resetSearchCandidateLifecycleForTests();
});

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { configurable: true, value });
}

function collection<T extends { id: string; name: string }>(values: T[]) {
  return Object.assign(values, {
    get: (id: string) => values.find((v) => v.id === id),
    search: ({ query = "" }: { query?: string }) =>
      values.filter((v) => v.name.toLowerCase().includes(query.toLowerCase())),
  });
}

function profileSettings(profiles: object[], activeId: string) {
  return {
    get: (_module: string, key: string) => {
      if (key === "contextProfiles") return JSON.stringify(profiles);
      if (key === "activeContextProfileId") return activeId;
      return undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// get_related_documents: profile enforcement
// ---------------------------------------------------------------------------

function makePage(id: string, html: string) {
  return {
    id,
    uuid: `JournalEntryPage.${id}`,
    name: `Page ${id}`,
    type: "text",
    sort: 0,
    text: { html, content: html },
  };
}

function makeJournal(id: string, pages: ReturnType<typeof makePage>[]) {
  return {
    id,
    uuid: `JournalEntry.${id}`,
    name: `Journal ${id}`,
    ownership: { default: 2 },
    pages: collection(pages),
  };
}

test("get_related_documents: active profile restricts returned doc types", () => {
  const html = "@UUID[Actor.a1]{The Raven} stands guard. Also see @UUID[Scene.s1]{Old Tower scene}.";
  const journals = collection([makeJournal("j1", [makePage("p1", html)])]);

  setGlobal("game", {
    user: { id: "gm", name: "GM", isGM: true },
    world: { id: "w1", title: "World" },
    actors: collection([{ id: "a1", name: "The Raven", ownership: { default: 2 } }]),
    journal: journals,
    scenes: collection([{ id: "s1", name: "Old Tower scene", ownership: { default: 2 } }]),
    settings: profileSettings(
      [{ id: "j-only", name: "Journals Only", allowedDocTypes: ["journal"], visibilityMode: "all", maxDocs: 50 }],
      "j-only",
    ),
  });

  const result = getRelatedDocuments({ uuid: "JournalEntry.j1.JournalEntryPage.p1" });
  // journal/journalPage allowed, actor and scene excluded
  assert.ok(result.related.every((r) => r.documentType === "journal" || r.documentType === "journalPage"), "only journal types returned");
  assert.ok(!result.related.some((r) => r.documentType === "actor"), "no actor");
  assert.ok(!result.related.some((r) => r.documentType === "scene"), "no scene");
});

test("get_related_documents: active profile caps results at maxDocs", () => {
  const links = Array.from({ length: 10 }, (_, i) => `@UUID[JournalEntry.j${i + 1}]{J${i + 1}}`).join(" ");
  const srcJournal = makeJournal("src", [makePage("p0", links)]);
  const linkedJournals = Array.from({ length: 10 }, (_, i) => makeJournal(`j${i + 1}`, []));
  const journals = collection([srcJournal, ...linkedJournals]);

  setGlobal("game", {
    user: { id: "gm", name: "GM", isGM: true },
    world: { id: "w1", title: "World" },
    actors: collection([]),
    journal: journals,
    scenes: collection([]),
    settings: profileSettings(
      [{ id: "small", name: "Small", allowedDocTypes: ["journal"], visibilityMode: "all", maxDocs: 3 }],
      "small",
    ),
  });

  const result = getRelatedDocuments({ uuid: "JournalEntry.src.JournalEntryPage.p0", limit: 20 });
  assert.ok(result.related.length <= 3, `expected ≤3 results, got ${result.related.length}`);
});

test("get_related_documents: no profile returns full results", () => {
  const html = "@UUID[Actor.a1]{Actor} @UUID[Scene.s1]{Scene}";
  const journals = collection([makeJournal("src", [makePage("p0", html)])]);

  setGlobal("game", {
    user: { id: "gm", name: "GM", isGM: true },
    world: { id: "w1", title: "World" },
    actors: collection([{ id: "a1", name: "Hero", ownership: { default: 2 } }]),
    journal: journals,
    scenes: collection([{ id: "s1", name: "Forest", ownership: { default: 2 } }]),
    settings: { get: () => undefined },
  });

  const result = getRelatedDocuments({ uuid: "JournalEntry.src.JournalEntryPage.p0" });
  assert.ok(result.related.some((r) => r.documentType === "actor"), "actor present when no profile");
  assert.ok(result.related.some((r) => r.documentType === "scene"), "scene present when no profile");
});

// ---------------------------------------------------------------------------
// Compendium exclusion per profile
// ---------------------------------------------------------------------------

test("listCompendiums: profile excludedCompendiums merges with global exclusions", () => {
  function makePack(id: string) {
    return {
      metadata: { id, label: id, type: "Item" },
      index: Object.assign([], { size: 0, get: () => undefined }),
      search: () => [],
    };
  }
  const packs = [makePack("world.allowed"), makePack("world.global-excluded"), makePack("world.profile-excluded")];
  const packCol = Object.assign(packs, {
    size: packs.length,
    get: (id: string) => packs.find((p) => p.metadata.id === id),
  });

  setGlobal("game", {
    user: { id: "gm", name: "GM", isGM: true },
    world: { id: "w1", title: "World" },
    packs: packCol,
    settings: {
      get: (_module: string, key: string) => {
        if (key === "excludedCompendiums") return "world.global-excluded";
        if (key === "contextProfiles")
          return JSON.stringify([{
            id: "p1",
            name: "P1",
            allowedDocTypes: ["journal"],
            visibilityMode: "all",
            maxDocs: 50,
            excludedCompendiums: ["world.profile-excluded"],
          }]);
        if (key === "activeContextProfileId") return "p1";
        return undefined;
      },
    },
  });
  setGlobal("CONFIG", {});

  const result = listCompendiums({});
  const ids = result.compendiums.map((c) => c.packId);
  assert.ok(ids.includes("world.allowed"), "allowed pack present");
  assert.ok(!ids.includes("world.global-excluded"), "global-excluded pack absent");
  assert.ok(!ids.includes("world.profile-excluded"), "profile-excluded pack absent");
});

// ---------------------------------------------------------------------------
// makeProfile and profile duplication helpers
// ---------------------------------------------------------------------------

test("makeProfile preserves includeActiveScene and excludedCompendiums fields", () => {
  const p = makeProfile(
    "Test",
    ["actor", "journal"],
    "all",
    30,
    "test-id",
    true,
    ["world.hidden"],
  );
  assert.equal(p.includeActiveScene, true);
  assert.deepEqual(p.excludedCompendiums, ["world.hidden"]);
});

test("makeProfile omits optional fields when falsy/empty", () => {
  const p = makeProfile("Test", ["actor"], "all", 30, "test-id", false, []);
  assert.equal(p.includeActiveScene, undefined);
  assert.equal(p.excludedCompendiums, undefined);
});

test("duplicate profile preserves all fields including new optional ones", () => {
  const source = makeProfile(
    "Source",
    ["actor"],
    "player-safe",
    40,
    "src-id",
    true,
    ["world.secret"],
  );
  const copy = makeProfile(
    `${source.name} (copy)`,
    [...source.allowedDocTypes],
    source.visibilityMode,
    source.maxDocs,
    undefined,
    source.includeActiveScene,
    source.excludedCompendiums ? [...source.excludedCompendiums] : undefined,
  );
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, "Source (copy)");
  assert.deepEqual(copy.allowedDocTypes, source.allowedDocTypes);
  assert.equal(copy.visibilityMode, source.visibilityMode);
  assert.equal(copy.maxDocs, source.maxDocs);
  assert.equal(copy.includeActiveScene, source.includeActiveScene);
  assert.deepEqual(copy.excludedCompendiums, source.excludedCompendiums);
});
