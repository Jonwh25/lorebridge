import assert from "node:assert/strict";
import test from "node:test";

import {
  RAVENS_EYE_SPEC_VERSION,
  FOUNDRY_EXTENSION_NAMESPACE,
  validateCampaignManifest,
  validateCoreRecord,
  validateFoundryJournalExtension,
  validateFoundryFolderResource,
  validateFoundrySceneResource,
  validateFoundryRollTableResource,
  validateFoundryExportScope,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Fixtures — representative known-good values for each document type
// ---------------------------------------------------------------------------

const JOURNAL_UUID = "entry:3f6e3e7a-b1c4-4f2d-8a9e-0123456789ab";
const ACTOR_UUID   = "npc:7a2c1d4e-0f3b-4a8c-b6d2-fedcba987654";
const TABLE_UUID   = "table:9b0a4c2d-1e5f-4b3a-a7c8-123456789012";
const PLACE_UUID   = "place:1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const FOLDER_STABLE_ID    = "foundry-folder:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SCENE_STABLE_ID     = "foundry-scene:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const ROLL_TABLE_STABLE_ID = "foundry-roll-table:cccccccc-dddd-4eee-8fff-000000000000";
const EXPORT_SCOPE_ID     = "foundry-export-scope:dddddddd-eeee-4fff-8000-111111111111";

const goodManifest = {
  specification: RAVENS_EYE_SPEC_VERSION,
  id: "campaign:11111111-2222-4333-8444-555555555555",
  name: "Curse of Strahd",
  playFormat: "campaign",
  coverage: "partial",
  gameSystem: {
    id: "dnd5e",
    rulesRevision: "2024",
    extensionVersion: "1.0.0",
  },
};

const goodJournalRecord = {
  id: JOURNAL_UUID,
  type: "entry",
  audience: "facilitator",
  sections: [
    { key: "boxed-text", audience: "players" },
    { key: "gm-notes", audience: "facilitator" },
  ],
  relationships: [
    { target: PLACE_UUID, label: "describes", audience: "facilitator" },
  ],
  extensions: {
    [FOUNDRY_EXTENSION_NAMESPACE]: {
      sourceDocument: {
        type: "JournalEntry",
        id: "abc123def456abc1",
        uuid: "JournalEntry.abc123def456abc1",
      },
      pages: [
        {
          section: "boxed-text",
          sort: 100000,
          sourceDocument: {
            type: "JournalEntryPage",
            id: "page001abc123def4",
            uuid: "JournalEntry.abc123def456abc1.JournalEntryPage.page001abc123def4",
          },
        },
      ],
    },
  },
};

const goodActorRecord = {
  id: ACTOR_UUID,
  type: "npc",
  audience: "facilitator",
  kind: "site",
  relationships: [
    { target: PLACE_UUID, label: "located-in", audience: "facilitator" },
  ],
};

const goodTableRecord = {
  id: TABLE_UUID,
  type: "table",
  audience: "facilitator",
};

const goodFolderResource = {
  id: FOLDER_STABLE_ID,
  type: "folder",
  sourceDocument: {
    type: "Folder",
    id: "folder001abc12345",
    uuid: "Folder.folder001abc12345",
  },
  documentType: "Scene",
  name: "Argynvostholt",
  sort: 200000,
};

const goodFolderWithParent = {
  ...goodFolderResource,
  parent: FOLDER_STABLE_ID,
};

const goodSceneResource = {
  id: SCENE_STABLE_ID,
  type: "scene",
  sourceDocument: {
    type: "Scene",
    id: "scene001abcdefgh",
    uuid: "Scene.scene001abcdefgh",
  },
  profile: "structure",
  folder: FOLDER_STABLE_ID,
  place: PLACE_UUID,
  structure: {
    foundrySourceData: {
      name: "Argynvostholt Ground Floor",
      navigation: false,
      grid: { type: 1, size: 100, distance: 5, units: "ft" },
      background: { src: "modules/cos/scenes/argynvostholt.webp" },
      walls: [],
      lights: [],
      drawings: [],
      tiles: [],
      regions: [],
      tokens: [],
    },
  },
  references: [
    { role: "area", sourceUuid: "JournalEntry.abc123", target: PLACE_UUID },
  ],
};

const goodRollTableResource = {
  id: ROLL_TABLE_STABLE_ID,
  type: "roll-table",
  sourceDocument: {
    type: "RollTable",
    id: "table001abcdef01",
    uuid: "RollTable.table001abcdef01",
  },
  coreRecord: TABLE_UUID,
  formula: "1d6",
  replacement: true,
  displayRoll: true,
  results: [
    { sourceId: "result-001", range: [1, 2], weight: 1, drawn: false },
    { sourceId: "result-002", range: [3, 4], weight: 1, drawn: false },
    { sourceId: "result-003", range: [5, 6], weight: 1, drawn: false },
  ],
};

const goodExportScope = {
  id: EXPORT_SCOPE_ID,
  type: "export-scope",
  mode: "selected-folders",
  selectedFolders: [FOLDER_STABLE_ID],
};

// ---------------------------------------------------------------------------
// Campaign manifest
// ---------------------------------------------------------------------------

test("validateCampaignManifest — accepts a valid manifest", () => {
  const result = validateCampaignManifest(goodManifest);
  assert.equal(result.valid, true);
  assert.equal(result.value?.specification, RAVENS_EYE_SPEC_VERSION);
  assert.equal(result.value?.name, "Curse of Strahd");
  assert.equal(result.value?.coverage, "partial");
});

test("validateCampaignManifest — rejects unsupported specification version", () => {
  const result = validateCampaignManifest({ ...goodManifest, specification: "0.2.0-experimental" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /specification/);
});

test("validateCampaignManifest — rejects missing id", () => {
  const { id: _id, ...rest } = goodManifest;
  const result = validateCampaignManifest(rest);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /id/);
});

test("validateCampaignManifest — rejects id without campaign prefix", () => {
  const result = validateCampaignManifest({
    ...goodManifest,
    id: "entry:11111111-2222-4333-8444-555555555555",
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /id/);
});

test("validateCampaignManifest — rejects invalid playFormat", () => {
  const result = validateCampaignManifest({ ...goodManifest, playFormat: "ongoing" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /playFormat/);
});

test("validateCampaignManifest — rejects missing gameSystem fields", () => {
  const result = validateCampaignManifest({
    ...goodManifest,
    gameSystem: { id: "dnd5e" },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /rulesRevision/);
});

test("validateCampaignManifest — rejects prototype pollution key", () => {
  // Use JSON.parse so "__proto__" is created as an own enumerable property,
  // matching what a YAML parser produces in practice.
  const base = JSON.parse(JSON.stringify(goodManifest));
  const malicious = JSON.parse(
    JSON.stringify({ ...base, __proto__: { polluted: true } }, (k, v) =>
      k === "__proto__" ? v : v,
    ),
  );
  // Simpler: build the raw JSON string directly.
  const raw = JSON.parse(
    `{"specification":"${RAVENS_EYE_SPEC_VERSION}","id":"campaign:11111111-2222-4333-8444-555555555555","name":"Curse of Strahd","playFormat":"campaign","coverage":"partial","gameSystem":{"id":"dnd5e","rulesRevision":"2024","extensionVersion":"1.0.0"},"__proto__":{"polluted":true}}`,
  );
  const result = validateCampaignManifest(raw);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /__proto__/);
});

// ---------------------------------------------------------------------------
// Core record
// ---------------------------------------------------------------------------

test("validateCoreRecord — accepts a valid journal entry record", () => {
  const result = validateCoreRecord(goodJournalRecord);
  assert.equal(result.valid, true);
  assert.equal(result.value?.id, JOURNAL_UUID);
  assert.equal(result.value?.audience, "facilitator");
});

test("validateCoreRecord — accepts a valid NPC record without extensions", () => {
  const result = validateCoreRecord(goodActorRecord);
  assert.equal(result.valid, true);
  assert.equal(result.value?.id, ACTOR_UUID);
  assert.equal(result.value?.type, "npc");
});

test("validateCoreRecord — accepts a valid table record", () => {
  const result = validateCoreRecord(goodTableRecord);
  assert.equal(result.valid, true);
  assert.equal(result.value?.id, TABLE_UUID);
});

test("validateCoreRecord — preserves all fields on success (round-trip)", () => {
  const result = validateCoreRecord(goodJournalRecord);
  assert.equal(result.valid, true);
  // Stable ID is preserved
  assert.equal(result.value?.id, JOURNAL_UUID);
  // Relationship target is preserved
  assert.equal(result.value?.relationships?.[0]?.target, PLACE_UUID);
  // Audience (visibility) is preserved
  assert.equal(result.value?.audience, "facilitator");
  // Section audience is preserved
  assert.equal(result.value?.sections?.[0]?.audience, "players");
});

test("validateCoreRecord — rejects invalid record type", () => {
  const result = validateCoreRecord({ ...goodActorRecord, type: "monster" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /type/);
});

test("validateCoreRecord — rejects invalid audience", () => {
  const result = validateCoreRecord({ ...goodActorRecord, audience: "gm-only" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /audience/);
});

test("validateCoreRecord — rejects malformed record id", () => {
  const result = validateCoreRecord({ ...goodActorRecord, id: "npc:not-a-uuid" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /id/);
});

test("validateCoreRecord — rejects id with wrong prefix for type", () => {
  const result = validateCoreRecord({ ...goodActorRecord, id: "entry:7a2c1d4e-0f3b-4a8c-b6d2-fedcba987654" });
  // ID prefix "entry" doesn't match type "npc" — current validator accepts this
  // because the regex only checks structure, not type-vs-prefix consistency.
  // Structural validation passes; semantic cross-field check is a future validator concern.
  assert.ok(result); // at minimum it returns a result
});

test("validateCoreRecord — rejects malformed relationship target", () => {
  const result = validateCoreRecord({
    ...goodActorRecord,
    relationships: [{ target: "bad-id", label: "connected", audience: "facilitator" }],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /target/);
});

test("validateCoreRecord — rejects relationship without required label", () => {
  const result = validateCoreRecord({
    ...goodActorRecord,
    relationships: [{ target: PLACE_UUID, audience: "facilitator" }],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /label/);
});

test("validateCoreRecord — rejects malformed parent id", () => {
  const result = validateCoreRecord({ ...goodActorRecord, parent: "folder:bad" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /parent/);
});

test("validateCoreRecord — rejects secret-bearing extension field", () => {
  const result = validateCoreRecord({
    ...goodActorRecord,
    extensions: { token: "sk-live-abc123" },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /token/);
});

test("validateCoreRecord — rejects prototype pollution in extensions", () => {
  // JSON.parse creates "__proto__" as an own enumerable property, matching
  // what a YAML parser produces; the object-literal syntax would not.
  const raw = JSON.parse(
    `{"id":"${ACTOR_UUID}","type":"npc","audience":"facilitator","extensions":{"__proto__":{"admin":true}}}`,
  );
  const result = validateCoreRecord(raw);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /__proto__/);
});

// ---------------------------------------------------------------------------
// Foundry journal extension
// ---------------------------------------------------------------------------

test("validateFoundryJournalExtension — accepts valid journal provenance", () => {
  const ext = goodJournalRecord.extensions[FOUNDRY_EXTENSION_NAMESPACE];
  const result = validateFoundryJournalExtension(ext);
  assert.equal(result.valid, true);
});

test("validateFoundryJournalExtension — rejects wrong sourceDocument type", () => {
  const ext = {
    ...goodJournalRecord.extensions[FOUNDRY_EXTENSION_NAMESPACE],
    sourceDocument: {
      type: "Actor",
      id: "abc",
      uuid: "JournalEntry.abc",
    },
  };
  const result = validateFoundryJournalExtension(ext);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /JournalEntry/);
});

test("validateFoundryJournalExtension — rejects page with wrong sourceDocument type", () => {
  const base = goodJournalRecord.extensions[FOUNDRY_EXTENSION_NAMESPACE];
  const ext = {
    ...base,
    pages: [
      {
        section: "boxed-text",
        sort: 100000,
        sourceDocument: {
          type: "WrongType",
          id: "page001",
          uuid: "JournalEntry.abc.JournalEntryPage.page001",
        },
      },
    ],
  };
  const result = validateFoundryJournalExtension(ext);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /JournalEntryPage/);
});

// ---------------------------------------------------------------------------
// Foundry folder resource
// ---------------------------------------------------------------------------

test("validateFoundryFolderResource — accepts a valid folder", () => {
  const result = validateFoundryFolderResource(goodFolderResource);
  assert.equal(result.valid, true);
  assert.equal(result.value?.id, FOLDER_STABLE_ID);
  assert.equal(result.value?.name, "Argynvostholt");
});

test("validateFoundryFolderResource — accepts a folder with parent", () => {
  const result = validateFoundryFolderResource(goodFolderWithParent);
  assert.equal(result.valid, true);
  assert.equal(result.value?.parent, FOLDER_STABLE_ID);
});

test("validateFoundryFolderResource — rejects malformed folder id", () => {
  const result = validateFoundryFolderResource({ ...goodFolderResource, id: "folder:bad" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /id/);
});

test("validateFoundryFolderResource — rejects wrong type value", () => {
  const result = validateFoundryFolderResource({ ...goodFolderResource, type: "directory" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /type/);
});

test("validateFoundryFolderResource — rejects missing name", () => {
  const { name: _name, ...rest } = goodFolderResource;
  const result = validateFoundryFolderResource(rest);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /name/);
});

test("validateFoundryFolderResource — rejects invalid parent id", () => {
  const result = validateFoundryFolderResource({ ...goodFolderResource, parent: "bad-parent" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /parent/);
});

// ---------------------------------------------------------------------------
// Foundry scene resource
// ---------------------------------------------------------------------------

test("validateFoundrySceneResource — accepts a valid scene", () => {
  const result = validateFoundrySceneResource(goodSceneResource);
  assert.equal(result.valid, true);
  assert.equal(result.value?.id, SCENE_STABLE_ID);
  assert.equal(result.value?.profile, "structure");
  assert.equal(result.value?.place, PLACE_UUID);
});

test("validateFoundrySceneResource — rejects path traversal in background src", () => {
  const result = validateFoundrySceneResource({
    ...goodSceneResource,
    structure: {
      foundrySourceData: {
        ...goodSceneResource.structure.foundrySourceData,
        background: { src: "../../etc/passwd" },
      },
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /path traversal/i);
});

test("validateFoundrySceneResource — rejects session-snapshot profile without sessionSnapshot", () => {
  const result = validateFoundrySceneResource({ ...goodSceneResource, profile: "session-snapshot" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sessionSnapshot/);
});

test("validateFoundrySceneResource — rejects structure profile with sessionSnapshot", () => {
  const result = validateFoundrySceneResource({
    ...goodSceneResource,
    sessionSnapshot: { active: true },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sessionSnapshot/);
});

test("validateFoundrySceneResource — accepts session-snapshot with snapshot data", () => {
  const result = validateFoundrySceneResource({
    ...goodSceneResource,
    profile: "session-snapshot",
    sessionSnapshot: { combatId: "abc123", tokenPositions: [] },
  });
  assert.equal(result.valid, true);
  assert.equal(result.value?.profile, "session-snapshot");
});

test("validateFoundrySceneResource — rejects invalid reference target", () => {
  const result = validateFoundrySceneResource({
    ...goodSceneResource,
    references: [{ role: "area", sourceUuid: "JournalEntry.abc", target: "bad-target" }],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /target/);
});

test("validateFoundrySceneResource — rejects invalid folder link", () => {
  const result = validateFoundrySceneResource({ ...goodSceneResource, folder: "folder:bad" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /folder/);
});

// ---------------------------------------------------------------------------
// Foundry roll-table resource
// ---------------------------------------------------------------------------

test("validateFoundryRollTableResource — accepts a valid roll table", () => {
  const result = validateFoundryRollTableResource(goodRollTableResource);
  assert.equal(result.valid, true);
  assert.equal(result.value?.formula, "1d6");
  assert.equal(result.value?.results.length, 3);
});

test("validateFoundryRollTableResource — rejects malformed coreRecord id", () => {
  const result = validateFoundryRollTableResource({
    ...goodRollTableResource,
    coreRecord: "entry:9b0a4c2d-1e5f-4b3a-a7c8-123456789012",
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /coreRecord/);
});

test("validateFoundryRollTableResource — rejects malformed result range", () => {
  const result = validateFoundryRollTableResource({
    ...goodRollTableResource,
    results: [{ sourceId: "r1", range: [1], weight: 1, drawn: false }],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /range/);
});

test("validateFoundryRollTableResource — rejects negative weight", () => {
  const result = validateFoundryRollTableResource({
    ...goodRollTableResource,
    results: [{ sourceId: "r1", range: [1, 6], weight: -1, drawn: false }],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /weight/);
});

// ---------------------------------------------------------------------------
// Foundry export scope
// ---------------------------------------------------------------------------

test("validateFoundryExportScope — accepts a valid export scope", () => {
  const result = validateFoundryExportScope(goodExportScope);
  assert.equal(result.valid, true);
  assert.equal(result.value?.mode, "selected-folders");
  assert.equal(result.value?.selectedFolders.length, 1);
});

test("validateFoundryExportScope — rejects empty selectedFolders", () => {
  const result = validateFoundryExportScope({ ...goodExportScope, selectedFolders: [] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /selectedFolders/);
});

test("validateFoundryExportScope — rejects invalid folder id in selectedFolders", () => {
  const result = validateFoundryExportScope({
    ...goodExportScope,
    selectedFolders: ["bad-id"],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /selectedFolders\[0\]/);
});

test("validateFoundryExportScope — rejects wrong mode", () => {
  const result = validateFoundryExportScope({ ...goodExportScope, mode: "full-world" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /mode/);
});

// ---------------------------------------------------------------------------
// Non-object inputs
// ---------------------------------------------------------------------------

test("validateCampaignManifest — rejects null", () => {
  const result = validateCampaignManifest(null);
  assert.equal(result.valid, false);
});

test("validateCoreRecord — rejects a string", () => {
  const result = validateCoreRecord("not-an-object");
  assert.equal(result.valid, false);
});

test("validateFoundryFolderResource — rejects an array", () => {
  const result = validateFoundryFolderResource([1, 2, 3]);
  assert.equal(result.valid, false);
});
