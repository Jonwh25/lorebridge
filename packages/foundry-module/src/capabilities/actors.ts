import {
  validateGetActorInput,
  validateGetActorOutput,
  validateSearchActorsInput,
  validateSearchActorsOutput,
  type ActorSearchMatch,
  type Dnd5eAbility,
  type Dnd5eActorMechanics,
  type Dnd5eSpellSlot,
  type Dnd5eResource,
  type GetActorInput,
  type GetActorOutput,
  type SearchActorsInput,
  type SearchActorsOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";
import { collectWorldCandidateUuids } from "./search-candidates.js";
import { plainText } from "../utils/html.js";

const DEFAULT_LIMIT = 10;
const EXCERPT_LENGTH = 240;
const DESCRIPTION_LENGTH = 20_000;

function sourceId(): string {
  if (!game.world) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry world is not fully initialized.",
      { retryable: true },
    );
  }
  return `foundry:${game.world.id}`;
}

function sourceName(): string {
  if (!game.world) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry world is not fully initialized.",
      { retryable: true },
    );
  }
  return game.world.title;
}

function nestedValue(root: unknown, path: string[]): unknown {
  let value = root;
  for (const key of path) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["value", "public", "content"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return undefined;
}

function actorDescription(actor: FoundryActor): string {
  const candidates = [
    ["details", "biography"],
    ["biography"],
    ["description"],
    ["details", "description"],
  ];
  for (const path of candidates) {
    const value = textValue(nestedValue(actor.system, path));
    if (value) return plainText(value).slice(0, DESCRIPTION_LENGTH);
  }
  return "";
}

function excerptAround(text: string, query: string): string {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - Math.floor(EXCERPT_LENGTH / 3));
  const value = text.slice(start, start + EXCERPT_LENGTH).trim();
  return `${start > 0 ? "…" : ""}${value}${start + EXCERPT_LENGTH < text.length ? "…" : ""}`;
}

function numField(root: unknown, ...keys: string[]): number | undefined {
  const v = nestedValue(root, keys);
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function extractDnd5eMechanics(actor: FoundryActor): Dnd5eActorMechanics | undefined {
  if (game.system.id !== "dnd5e") return undefined;
  const sys = actor.system as Record<string, unknown>;
  const attrs = (sys.attributes ?? {}) as Record<string, unknown>;
  const mechanics: Dnd5eActorMechanics = {};

  // Armor Class
  const ac = numField(attrs, "ac", "value");
  if (ac !== undefined) mechanics.armorClass = ac;

  // Hit Points
  const hpCurrent = numField(attrs, "hp", "value");
  const hpMax = numField(attrs, "hp", "max");
  if (hpCurrent !== undefined && hpMax !== undefined) {
    mechanics.hitPoints = { current: hpCurrent, max: hpMax };
    const hpTemp = numField(attrs, "hp", "temp");
    if (hpTemp !== undefined && hpTemp > 0) mechanics.hitPoints.temp = hpTemp;
  }

  // Proficiency bonus
  const prof = numField(attrs, "prof");
  if (prof !== undefined) mechanics.proficiencyBonus = prof;

  // Exhaustion
  const exhaustion = numField(attrs, "exhaustion");
  if (exhaustion !== undefined) mechanics.exhaustion = exhaustion;

  // Conditions via actor.statuses (Foundry v14 Set<string>)
  const statuses = (actor as unknown as { statuses?: Set<string> }).statuses;
  if (statuses instanceof Set && statuses.size > 0) {
    mechanics.conditions = Array.from(statuses);
  }

  // Abilities
  const abilitiesData = (sys.abilities ?? {}) as Record<string, unknown>;
  const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
  const abilities: Record<string, Dnd5eAbility> = {};
  for (const key of ABILITY_KEYS) {
    const abl = abilitiesData[key];
    if (!abl || typeof abl !== "object") continue;
    const score = numField(abl, "value");
    const modifier = numField(abl, "mod");
    if (score === undefined || modifier === undefined) continue;
    const ability: Dnd5eAbility = { score, modifier };
    const save = numField(abl, "save") ?? numField(abl, "saveBonus");
    if (save !== undefined) ability.savingThrow = save;
    abilities[key] = ability;
  }
  if (Object.keys(abilities).length > 0) mechanics.abilities = abilities;

  // Movement
  const movementData = (attrs.movement ?? {}) as Record<string, unknown>;
  const movementFields = ["walk", "fly", "swim", "climb", "burrow"];
  const movement: Record<string, number | boolean | string> = {};
  for (const field of movementFields) {
    const v = numField(movementData, field);
    if (v !== undefined && v > 0) movement[field] = v;
  }
  if (typeof movementData.hover === "boolean" && movementData.hover) movement["hover"] = true;
  const movementUnits = typeof movementData.units === "string" ? movementData.units : undefined;
  if (movementUnits) movement["units"] = movementUnits;
  if (Object.keys(movement).length > 0) mechanics.movement = movement;

  // Senses
  const sensesData = (attrs.senses ?? {}) as Record<string, unknown>;
  const senseFields = ["darkvision", "blindsight", "truesight", "tremorsense"];
  const senses: Record<string, number | string> = {};
  // dnd5e 5.3+ moved sense ranges to senses.ranges.*; fall back to senses.* for older versions
  const sensesRangesRaw = sensesData.ranges;
  const sensesRanges = (typeof sensesRangesRaw === "object" && sensesRangesRaw !== null && !Array.isArray(sensesRangesRaw))
    ? sensesRangesRaw as Record<string, unknown>
    : sensesData;
  for (const field of senseFields) {
    const v = numField(sensesRanges, field);
    if (v !== undefined && v > 0) senses[field] = v;
  }
  const sensesUnits = typeof sensesData.units === "string" ? sensesData.units : undefined;
  if (sensesUnits) senses["units"] = sensesUnits;
  if (Object.keys(senses).length > 0) mechanics.senses = senses;

  // Spellcasting
  const spellcastingAbility = typeof attrs.spellcasting === "string" && attrs.spellcasting ? attrs.spellcasting : undefined;
  const spellSaveDc = numField(attrs, "spelldc");
  const spellAttack = numField(attrs, "spellAttack") ?? numField(attrs, "msak") ?? numField(attrs, "rsak");
  if (spellcastingAbility || spellSaveDc !== undefined) {
    mechanics.spellcasting = {};
    if (spellcastingAbility) mechanics.spellcasting.ability = spellcastingAbility;
    if (spellSaveDc !== undefined) mechanics.spellcasting.saveDc = spellSaveDc;
    if (spellAttack !== undefined) mechanics.spellcasting.attackBonus = spellAttack;
  }

  // Spell slots
  const spellsData = (sys.spells ?? {}) as Record<string, unknown>;
  const spellSlots: Dnd5eSpellSlot[] = [];
  for (let lvl = 1; lvl <= 9; lvl++) {
    const slot = spellsData[`spell${lvl}`];
    if (!slot || typeof slot !== "object") continue;
    const current = numField(slot, "value");
    const max = numField(slot, "max") ?? numField(slot, "override");
    if (max !== undefined && max > 0) {
      spellSlots.push({ level: lvl, current: current ?? 0, max });
    }
  }
  const pact = spellsData["pact"];
  if (pact && typeof pact === "object") {
    const current = numField(pact, "value");
    const max = numField(pact, "max");
    const level = numField(pact, "level");
    if (max !== undefined && max > 0 && level !== undefined) {
      spellSlots.push({ level: level * -1, current: current ?? 0, max });
    }
  }
  if (spellSlots.length > 0) mechanics.spellSlots = spellSlots;

  // Resources (primary, secondary, tertiary)
  const resourcesData = (sys.resources ?? {}) as Record<string, unknown>;
  const resources: Dnd5eResource[] = [];
  for (const key of ["primary", "secondary", "tertiary"]) {
    const res = resourcesData[key];
    if (!res || typeof res !== "object") continue;
    const label = typeof (res as Record<string, unknown>).label === "string" ? (res as Record<string, unknown>).label as string : "";
    const current = numField(res, "value");
    const max = numField(res, "max");
    if (label || (max !== undefined && max > 0)) {
      const resource: Dnd5eResource = { label: label || key };
      if (current !== undefined) resource.current = current;
      if (max !== undefined) resource.max = max;
      resources.push(resource);
    }
  }
  if (resources.length > 0) mechanics.resources = resources;

  if (Object.keys(mechanics).length === 0) return undefined;
  return mechanics;
}

export function searchActors(input: SearchActorsInput): SearchActorsOutput {
  requireFoundryGm("searchActors");
  const validated = validateSearchActorsInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Actor search input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }
  if (!game.actors) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry actor collection is unavailable.",
      { retryable: true },
    );
  }

  const query = validated.value.query.trim();
  const needle = query.toLocaleLowerCase();
  const types = validated.value.types?.map((type) => type.toLocaleLowerCase());
  const playerMode = validated.value.mode === "player";
  const filterFolderId = validated.value.folderId;
  const excludeFolderIdSet = validated.value.excludeFolderIds && validated.value.excludeFolderIds.length > 0 ? new Set(validated.value.excludeFolderIds) : undefined;
  const candidateUuids = collectWorldCandidateUuids(query, "Actor", game.actors);
  const matches: Array<{ score: number; candidate: number; value: ActorSearchMatch }> = [];
  let hiddenCount = 0;

  for (const actor of game.actors) {
    if (playerMode && !isPlayerVisible(actor.ownership)) { hiddenCount++; continue; }
    if (types && !types.includes(actor.type.toLocaleLowerCase())) continue;
    if (filterFolderId !== undefined && actor.folder?.id !== filterFolderId) continue;
    if (excludeFolderIdSet !== undefined && excludeFolderIdSet.has(actor.folder?.id ?? "")) continue;
    const name = actor.name.toLocaleLowerCase();
    const description = actorDescription(actor);
    let match: { score: number; value: ActorSearchMatch } | undefined;
    if (name.includes(needle)) {
      match = {
        score: name === needle ? 0 : 1,
        value: {
          actorId: actor.id,
          actorUuid: actor.uuid,
          actorName: actor.name,
          actorType: actor.type,
          matchedField: "actorName",
        },
      };
    } else if (description.toLocaleLowerCase().includes(needle)) {
      match = {
        score: 2,
        value: {
          actorId: actor.id,
          actorUuid: actor.uuid,
          actorName: actor.name,
          actorType: actor.type,
          matchedField: "description",
          excerpt: excerptAround(description, query),
        },
      };
    }
    if (match) {
      if (actor.img) match.value.img = actor.img;
      if (actor.folder?.id) match.value.folderId = actor.folder.id;
      if (actor.folder?.name) match.value.folderName = actor.folder.name;
      matches.push({ ...match, candidate: candidateUuids.has(actor.uuid) ? 0 : 1 });
    }
  }

  const output: SearchActorsOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    query,
    results: matches
      .sort((left, right) =>
        left.score - right.score
        || left.candidate - right.candidate
        || left.value.actorName.localeCompare(right.value.actorName)
        || left.value.actorId.localeCompare(right.value.actorId))
      .slice(0, validated.value.limit ?? DEFAULT_LIMIT)
      .map(({ value }) => value),
    hiddenCount,
  };
  const outputValidation = validateSearchActorsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid actor search results.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}

export function getActor(input: GetActorInput): GetActorOutput {
  requireFoundryGm("getActor");
  const validated = validateGetActorInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Actor retrieval input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }
  if (!game.actors) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry actor collection is unavailable.",
      { retryable: true },
    );
  }

  const actorId = validated.value.actorId.startsWith("Actor.")
    ? validated.value.actorId.split(".")[1] ?? ""
    : validated.value.actorId;
  const actor = game.actors.get(actorId);
  if (!actor) throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested actor was not found.");
  if (validated.value.mode === "player" && !isPlayerVisible(actor.ownership)) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested actor was not found.");
  }

  const output: GetActorOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    systemId: game.system.id,
    id: actor.id,
    uuid: actor.uuid,
    name: actor.name,
    type: actor.type,
  };
  if (actor.img) output.img = actor.img;
  if (actor.folder) output.folder = { id: actor.folder.id, name: actor.folder.name };
  const description = actorDescription(actor);
  if (description) output.description = { plainText: description };
  const mechanics = extractDnd5eMechanics(actor);
  if (mechanics) output.mechanics = mechanics;

  const outputValidation = validateGetActorOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned an invalid actor.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}
