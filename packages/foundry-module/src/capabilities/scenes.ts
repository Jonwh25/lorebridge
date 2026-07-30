import {
  validateGetSceneInput,
  validateGetSceneOutput,
  validateSearchScenesInput,
  validateSearchScenesOutput,
  type GetSceneInput,
  type GetSceneOutput,
  type SceneNote,
  type SceneSearchMatch,
  type SceneToken,
  type SearchScenesInput,
  type SearchScenesOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";

const DEFAULT_LIMIT = 10;
const TOKEN_LIMIT = 20;
const NOTE_LIMIT = 20;

function sourceId(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return `foundry:${game.world.id}`;
}

function sourceName(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return game.world.title;
}

function sceneSearchMatch(scene: FoundryScene): SceneSearchMatch {
  const match: SceneSearchMatch = {
    sceneId: scene.id,
    sceneUuid: scene.uuid,
    sceneName: scene.name,
    active: scene.active,
    navigation: scene.navigation,
    matchedField: "sceneName",
  };
  if (scene.navName) match.navName = scene.navName;
  if (scene.thumb) match.thumb = scene.thumb;
  return match;
}

export function searchScenes(input: SearchScenesInput): SearchScenesOutput {
  requireFoundryGm("searchScenes");
  const validated = validateSearchScenesInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Scene search input is invalid.", { details: { validationErrors: validated.errors } });
  }
  if (!game.scenes) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry scene collection is unavailable.", { retryable: true });

  const query = validated.value.query.trim();
  const needle = query.toLocaleLowerCase();
  const matches: Array<{ score: number; value: SceneSearchMatch }> = [];

  for (const scene of game.scenes) {
    const name = scene.name.toLocaleLowerCase();
    if (!name.includes(needle)) continue;
    matches.push({
      score: name === needle ? 0 : 1,
      value: sceneSearchMatch(scene),
    });
  }

  const output: SearchScenesOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    query,
    results: matches
      .sort((a, b) => a.score - b.score || a.value.sceneName.localeCompare(b.value.sceneName))
      .slice(0, validated.value.limit ?? DEFAULT_LIMIT)
      .map(({ value }) => value),
  };
  const outputValidation = validateSearchScenesOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned invalid scene search results.", { details: { validationErrors: outputValidation.errors } });
  }
  return outputValidation.value;
}

export function getScene(input: GetSceneInput): GetSceneOutput {
  requireFoundryGm("getScene");
  const validated = validateGetSceneInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Scene retrieval input is invalid.", { details: { validationErrors: validated.errors } });
  }
  if (!game.scenes) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry scene collection is unavailable.", { retryable: true });

  const nativeId = validated.value.sceneId.startsWith("Scene.")
    ? validated.value.sceneId.split(".")[1] ?? ""
    : validated.value.sceneId;
  const scene = game.scenes.get(nativeId);
  if (!scene) throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested scene was not found.");

  const output: GetSceneOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    id: scene.id,
    uuid: scene.uuid,
    name: scene.name,
    active: scene.active,
    navigation: scene.navigation,
  };

  if (scene.navName) output.navName = scene.navName;
  if (scene.thumb) output.thumb = scene.thumb;
  if (scene.background?.src) output.background = { src: scene.background.src };
  if (typeof scene.width === "number") output.width = scene.width;
  if (typeof scene.height === "number") output.height = scene.height;
  if (scene.folder) output.folder = { id: scene.folder.id, name: scene.folder.name };

  if (scene.journal) {
    output.linkedJournal = {
      id: scene.journal.id,
      uuid: scene.journal.uuid,
      name: scene.journal.name,
    };
    if (scene.journalEntryPage) {
      output.linkedJournal.pageId = scene.journalEntryPage.id;
      output.linkedJournal.pageUuid = scene.journalEntryPage.uuid;
      output.linkedJournal.pageName = scene.journalEntryPage.name;
    }
  }

  const tokens: SceneToken[] = [];
  for (const token of scene.tokens) {
    if (tokens.length >= TOKEN_LIMIT) break;
    const entry: SceneToken = { id: token.id, name: token.name };
    if (token.actorId) entry.actorId = token.actorId;
    if (token.actor?.uuid) entry.actorUuid = token.actor.uuid;
    tokens.push(entry);
  }
  if (tokens.length > 0) output.tokens = tokens;

  const notes: SceneNote[] = [];
  for (const note of scene.notes) {
    if (notes.length >= NOTE_LIMIT) break;
    const entry: SceneNote = { id: note.id };
    if (note.label) entry.label = note.label;
    if (note.entry) {
      entry.journalId = note.entry.id;
      entry.journalUuid = note.entry.uuid;
      entry.journalName = note.entry.name;
    } else if (note.entryId) {
      entry.journalId = note.entryId;
    }
    if (note.page) {
      entry.pageId = note.page.id;
      entry.pageUuid = note.page.uuid;
      entry.pageName = note.page.name;
    } else if (note.pageId) {
      entry.pageId = note.pageId;
    }
    notes.push(entry);
  }
  if (notes.length > 0) output.notes = notes;

  const outputValidation = validateGetSceneOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned an invalid scene.", { details: { validationErrors: outputValidation.errors } });
  }
  return outputValidation.value;
}
