import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getRelatedDocuments } from "../src/capabilities/related-documents.js";
import { listCompendiums, searchCompendium } from "../src/capabilities/compendium.js";
import { getContextProfiles, getProfileFilter, hasStaleFolderRefs, makeProfile, saveContextProfiles } from "../src/capabilities/context-profile.js";
import { gatherDocuments } from "../src/capabilities/consistency-audit.js";
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
// HTML data-uuid extraction (ProseMirror format)
// ---------------------------------------------------------------------------

test("get_related_documents: resolves UUID links stored as data-uuid attributes (ProseMirror HTML)", () => {
  // Foundry's ProseMirror editor converts @UUID[...] to <a data-uuid="..."> in HTML-format pages.
  const html = [
    `<p>Morgan awaits in the tower.</p>`,
    `<p><a class="content-link" data-type="Actor" data-id="abc1" data-uuid="Actor.abc1" draggable="true">Morgan Freerealms</a></p>`,
    `<p>See also <a class="content-link" data-type="Scene" data-id="sc1" data-uuid="Scene.sc1">The Chamber</a>.</p>`,
  ].join("\n");

  const journals = collection([makeJournal("j1", [makePage("p1", html)])]);

  setGlobal("game", {
    user: { id: "gm", name: "GM", isGM: true },
    world: { id: "w1", title: "World" },
    actors: collection([{ id: "abc1", name: "Morgan Freerealms", ownership: { default: 2 } }]),
    journal: journals,
    scenes: collection([{ id: "sc1", name: "The Chamber", ownership: { default: 2 } }]),
    settings: { get: () => undefined },
  });

  const result = getRelatedDocuments({ uuid: "JournalEntry.j1.JournalEntryPage.p1" });
  const actorLink = result.related.find((r) => r.documentType === "actor");
  const sceneLink = result.related.find((r) => r.documentType === "scene");
  assert.ok(actorLink, "actor linked via data-uuid is found");
  assert.equal(actorLink?.name, "Morgan Freerealms");
  assert.ok(sceneLink, "scene linked via data-uuid is found");
  assert.equal(sceneLink?.name, "The Chamber");
});

test("get_related_documents: deduplicates UUID links present in both data-uuid and @UUID forms", () => {
  // Some pages may have both forms if content is mixed or copy-pasted.
  const html = [
    `<a data-uuid="Actor.abc1">Morgan</a>`,
    `@UUID[Actor.abc1]{Morgan Freerealms}`,
  ].join(" ");

  const journals = collection([makeJournal("j1", [makePage("p1", html)])]);

  setGlobal("game", {
    user: { id: "gm", name: "GM", isGM: true },
    world: { id: "w1", title: "World" },
    actors: collection([{ id: "abc1", name: "Morgan Freerealms", ownership: { default: 2 } }]),
    journal: journals,
    scenes: collection([]),
    settings: { get: () => undefined },
  });

  const result = getRelatedDocuments({ uuid: "JournalEntry.j1.JournalEntryPage.p1" });
  const actorLinks = result.related.filter((r) => r.uuid === "Actor.abc1");
  assert.equal(actorLinks.length, 1, "actor appears only once despite duplicate UUID references");
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
    ["folder-1", "folder-2"],
  );
  const copy = makeProfile(
    `${source.name} (copy)`,
    [...source.allowedDocTypes],
    source.visibilityMode,
    source.maxDocs,
    undefined,
    source.includeActiveScene,
    source.excludedCompendiums ? [...source.excludedCompendiums] : undefined,
    source.allowedFolderIds ? [...source.allowedFolderIds] : undefined,
  );
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, "Source (copy)");
  assert.deepEqual(copy.allowedDocTypes, source.allowedDocTypes);
  assert.equal(copy.visibilityMode, source.visibilityMode);
  assert.equal(copy.maxDocs, source.maxDocs);
  assert.equal(copy.includeActiveScene, source.includeActiveScene);
  assert.deepEqual(copy.excludedCompendiums, source.excludedCompendiums);
  assert.deepEqual(copy.allowedFolderIds, source.allowedFolderIds);
});

test("makeProfile stores allowedFolderIds and omits when empty", () => {
  const withFolders = makeProfile("F", ["journal"], "all", 50, undefined, undefined, undefined, ["f1", "f2"]);
  assert.deepEqual(withFolders.allowedFolderIds, ["f1", "f2"]);
  const withoutFolders = makeProfile("F", ["journal"], "all", 50, undefined, undefined, undefined, []);
  assert.equal(withoutFolders.allowedFolderIds, undefined);
});

// ---------------------------------------------------------------------------
// Folder-level scoping (#185)
// ---------------------------------------------------------------------------

test("getProfileFilter populates folderIds Set from allowedFolderIds", () => {
  const profile = makeProfile("Folder Test", ["journal", "actor"], "all", 50, "fp-1", undefined, undefined, ["folder-a", "folder-b"]);
  const filter = getProfileFilter(profile);
  assert.ok(filter.folderIds instanceof Set, "folderIds should be a Set");
  assert.equal(filter.folderIds?.size, 2);
  assert.ok(filter.folderIds?.has("folder-a"));
  assert.ok(filter.folderIds?.has("folder-b"));
});

test("getProfileFilter has no folderIds when allowedFolderIds is absent", () => {
  const profile = makeProfile("No Folders", ["journal"], "all", 50);
  const filter = getProfileFilter(profile);
  assert.equal(filter.folderIds, undefined);
});

test("gatherDocuments: folder filter restricts actors to allowed folder", () => {
  const actorInFolder = {
    id: "a1", uuid: "Actor.a1", name: "In Folder", type: "npc",
    folder: { id: "f1", name: "Villains" },
    ownership: { default: 2 },
    system: { details: { biography: { value: "A villain from the shadows." } } },
    items: { [Symbol.iterator]: () => [][Symbol.iterator](), size: 0, get: () => undefined, search: () => [] },
    getFlag: () => undefined,
    setFlag: async () => {},
    update: async () => ({}),
    createEmbeddedDocuments: async () => [],
  };
  const actorOutsideFolder = {
    id: "a2", uuid: "Actor.a2", name: "Outside Folder", type: "npc",
    folder: { id: "f2", name: "Heroes" },
    ownership: { default: 2 },
    system: { details: { biography: { value: "A hero from the mountains." } } },
    items: { [Symbol.iterator]: () => [][Symbol.iterator](), size: 0, get: () => undefined, search: () => [] },
    getFlag: () => undefined,
    setFlag: async () => {},
    update: async () => ({}),
    createEmbeddedDocuments: async () => [],
  };
  setGlobal("game", {
    user: { id: "gm", isGM: true },
    world: { id: "w1", title: "World" },
    journal: collection([]),
    actors: collection([actorInFolder, actorOutsideFolder]),
    scenes: collection([]),
    folders: collection([{ id: "f1", name: "Villains", type: "Actor" }, { id: "f2", name: "Heroes", type: "Actor" }]),
    settings: profileSettings([], ""),
  });
  const filter = getProfileFilter(makeProfile("FolderTest", ["actor"], "all", 50, undefined, undefined, undefined, ["f1"]));
  const docs = gatherDocuments(undefined, filter);
  assert.equal(docs.length, 1, "only the actor in folder f1 should appear");
  assert.equal(docs[0]?.name, "In Folder");
});

test("gatherDocuments: folder filter restricts journal pages to allowed folder", () => {
  const journalInFolder = {
    id: "j1", uuid: "JournalEntry.j1", name: "Lore Book",
    folder: { id: "f1", name: "Lore" },
    ownership: { default: 2 },
    pages: collection([{ id: "p1", uuid: "JournalEntry.j1.JournalEntryPage.p1", name: "Page 1", type: "text", sort: 0, text: { html: "<p>Lore content</p>", content: "<p>Lore content</p>" } }]),
  };
  const journalOutside = {
    id: "j2", uuid: "JournalEntry.j2", name: "Secret Book",
    folder: { id: "f2", name: "Secrets" },
    ownership: { default: 2 },
    pages: collection([{ id: "p2", uuid: "JournalEntry.j2.JournalEntryPage.p2", name: "Page 2", type: "text", sort: 0, text: { html: "<p>Secret content</p>", content: "<p>Secret content</p>" } }]),
  };
  setGlobal("game", {
    user: { id: "gm", isGM: true },
    world: { id: "w1", title: "World" },
    journal: collection([journalInFolder, journalOutside]),
    actors: collection([]),
    scenes: collection([]),
    folders: collection([{ id: "f1", name: "Lore", type: "JournalEntry" }, { id: "f2", name: "Secrets", type: "JournalEntry" }]),
    settings: profileSettings([], ""),
  });
  const filter = getProfileFilter(makeProfile("FolderJournal", ["journal"], "all", 50, undefined, undefined, undefined, ["f1"]));
  const docs = gatherDocuments(undefined, filter);
  assert.equal(docs.length, 1, "only the journal in folder f1 should appear");
  assert.ok(docs[0]?.name.startsWith("Lore Book"), "should be the Lore Book page");
});

test("gatherDocuments: no folder filter returns all documents", () => {
  const actor1 = {
    id: "a1", uuid: "Actor.a1", name: "Alpha", type: "npc",
    folder: { id: "f1", name: "Folder A" },
    ownership: { default: 2 },
    system: { details: { biography: { value: "Bio of alpha." } } },
    items: { [Symbol.iterator]: () => [][Symbol.iterator](), size: 0, get: () => undefined, search: () => [] },
    getFlag: () => undefined, setFlag: async () => {}, update: async () => ({}), createEmbeddedDocuments: async () => [],
  };
  const actor2 = {
    id: "a2", uuid: "Actor.a2", name: "Beta", type: "npc",
    folder: { id: "f2", name: "Folder B" },
    ownership: { default: 2 },
    system: { details: { biography: { value: "Bio of beta." } } },
    items: { [Symbol.iterator]: () => [][Symbol.iterator](), size: 0, get: () => undefined, search: () => [] },
    getFlag: () => undefined, setFlag: async () => {}, update: async () => ({}), createEmbeddedDocuments: async () => [],
  };
  setGlobal("game", {
    user: { id: "gm", isGM: true },
    world: { id: "w1", title: "World" },
    journal: collection([]),
    actors: collection([actor1, actor2]),
    scenes: collection([]),
    folders: collection([]),
    settings: profileSettings([], ""),
  });
  const filter = getProfileFilter(makeProfile("NoFolderRestriction", ["actor"], "all", 50));
  const docs = gatherDocuments(undefined, filter);
  assert.equal(docs.length, 2, "both actors returned when no folder restriction");
});

test("hasStaleFolderRefs: returns true when a referenced folder no longer exists", () => {
  setGlobal("game", {
    user: { id: "gm", isGM: true },
    world: { id: "w1", title: "World" },
    folders: collection([{ id: "f1", name: "Existing", type: "Actor" }]),
    settings: profileSettings([], ""),
  });
  const profile = makeProfile("Stale", ["actor"], "all", 50, undefined, undefined, undefined, ["f1", "missing-folder"]);
  assert.equal(hasStaleFolderRefs(profile), true, "should detect the missing folder");
});

test("hasStaleFolderRefs: returns false when all referenced folders exist", () => {
  setGlobal("game", {
    user: { id: "gm", isGM: true },
    world: { id: "w1", title: "World" },
    folders: collection([{ id: "f1", name: "Folder 1", type: "Actor" }, { id: "f2", name: "Folder 2", type: "Actor" }]),
    settings: profileSettings([], ""),
  });
  const profile = makeProfile("Valid", ["actor"], "all", 50, undefined, undefined, undefined, ["f1", "f2"]);
  assert.equal(hasStaleFolderRefs(profile), false, "all folders exist, no stale refs");
});

test("hasStaleFolderRefs: returns false when no folder restriction is set", () => {
  setGlobal("game", {
    user: { id: "gm", isGM: true },
    world: { id: "w1", title: "World" },
    folders: collection([]),
    settings: profileSettings([], ""),
  });
  const profile = makeProfile("No folders", ["actor"], "all", 50);
  assert.equal(hasStaleFolderRefs(profile), false, "no allowedFolderIds means no stale refs");
});
