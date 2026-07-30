import assert from "node:assert/strict";
import test from "node:test";
import {
  SEARCH_SCENES_CAPABILITY,
  GET_SCENE_CAPABILITY,
  validateSearchScenesInput,
  validateSearchScenesOutput,
  validateGetSceneInput,
  validateGetSceneOutput,
} from "../dist/capabilities.js";

test("exports canonical scene capabilities", () => {
  assert.equal(SEARCH_SCENES_CAPABILITY, "searchScenes");
  assert.equal(GET_SCENE_CAPABILITY, "getScene");
});

test("validates scene search input", () => {
  assert.equal(validateSearchScenesInput({ query: "Tser Falls", limit: 10 }).valid, true);
  assert.equal(validateSearchScenesInput({ query: "Tser" }).valid, true);
  assert.equal(validateSearchScenesInput({ query: " " }).valid, false);
  assert.equal(validateSearchScenesInput({ query: "Tser", limit: 51 }).valid, false);
  assert.equal(validateSearchScenesInput({ query: "Tser", limit: 0 }).valid, false);
});

test("validates scene search output", () => {
  assert.equal(validateSearchScenesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "Tser Falls",
    results: [{
      sceneId: "s1",
      sceneUuid: "Scene.s1",
      sceneName: "Tser Falls",
      active: true,
      navigation: true,
      matchedField: "sceneName",
    }],
  }).valid, true);
  assert.equal(validateSearchScenesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "Tser Falls",
    results: [],
  }).valid, true, "empty results is valid");
  assert.equal(validateSearchScenesOutput({
    sourceId: "foundry:cos",
    query: "Tser Falls",
    results: [],
  }).valid, false, "missing sourceName is invalid");
  assert.equal(validateSearchScenesOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    query: "Tser Falls",
    results: [{ sceneId: "s1", sceneUuid: "Scene.s1", sceneName: "Tser Falls", active: "yes", navigation: true, matchedField: "sceneName" }],
  }).valid, false, "non-boolean active is invalid");
});

test("validates get scene input", () => {
  assert.equal(validateGetSceneInput({ sceneId: "s1" }).valid, true);
  assert.equal(validateGetSceneInput({ sceneId: "Scene.s1" }).valid, true);
  assert.equal(validateGetSceneInput({ sceneId: "" }).valid, false);
  assert.equal(validateGetSceneInput({}).valid, false);
});

test("validates get scene output — minimal", () => {
  assert.equal(validateGetSceneOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    id: "s1",
    uuid: "Scene.s1",
    name: "Tser Falls",
    active: true,
    navigation: true,
  }).valid, true);
});

test("validates get scene output — full", () => {
  assert.equal(validateGetSceneOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    id: "s1",
    uuid: "Scene.s1",
    name: "Tser Falls",
    active: true,
    navigation: true,
    navName: "Tser Falls",
    thumb: "worlds/cos/thumbs/tser-falls.webp",
    background: { src: "worlds/cos/tser-falls.webp" },
    width: 4000,
    height: 3000,
    folder: { id: "f1", name: "Barovia" },
    linkedJournal: { id: "j1", uuid: "JournalEntry.j1", name: "Locations & NPCs", pageId: "p1", pageUuid: "JournalEntry.j1.JournalEntryPage.p1", pageName: "Tser Falls" },
    tokens: [{ id: "t1", name: "Strahd", actorId: "a1", actorUuid: "Actor.a1" }],
    notes: [{ id: "n1", label: "The Falls", journalId: "j1", journalUuid: "JournalEntry.j1", journalName: "Locations & NPCs", pageId: "p1", pageUuid: "JournalEntry.j1.JournalEntryPage.p1", pageName: "Tser Falls" }],
  }).valid, true);
});

test("validates get scene output — rejects invalid", () => {
  assert.equal(validateGetSceneOutput({
    sourceId: "foundry:cos",
    id: "s1",
    uuid: "Scene.s1",
    name: "Tser Falls",
    active: true,
    navigation: true,
  }).valid, false, "missing sourceName");
  assert.equal(validateGetSceneOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    id: "s1",
    uuid: "Scene.s1",
    name: "Tser Falls",
    active: "yes",
    navigation: true,
  }).valid, false, "non-boolean active");
  assert.equal(validateGetSceneOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    id: "s1",
    uuid: "Scene.s1",
    name: "Tser Falls",
    active: true,
    navigation: true,
    background: { src: "" },
  }).valid, false, "empty background src");
  assert.equal(validateGetSceneOutput({
    sourceId: "foundry:cos",
    sourceName: "Curse of Strahd",
    id: "s1",
    uuid: "Scene.s1",
    name: "Tser Falls",
    active: true,
    navigation: true,
    tokens: [{ id: "t1" }],
  }).valid, false, "token missing name");
});
