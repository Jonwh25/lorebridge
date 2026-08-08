import {
  validateGetActorInput,
  validateGetActorOutput,
  validateSearchActorsInput,
  validateSearchActorsOutput,
  type ActorSearchMatch,
  type GetActorInput,
  type GetActorOutput,
  type SearchActorsInput,
  type SearchActorsOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";
import { collectWorldCandidateUuids } from "./search-candidates.js";

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

function plainText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(html, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
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
  const candidateUuids = collectWorldCandidateUuids(query, "Actor", game.actors);
  const matches: Array<{ score: number; candidate: number; value: ActorSearchMatch }> = [];
  let hiddenCount = 0;

  for (const actor of game.actors) {
    if (playerMode && !isPlayerVisible(actor.ownership)) { hiddenCount++; continue; }
    if (types && !types.includes(actor.type.toLocaleLowerCase())) continue;
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
