import {
  validateListCompendiumsInput,
  validateListCompendiumsOutput,
  validateSearchCompendiumInput,
  validateSearchCompendiumOutput,
  validateGetCompendiumEntryInput,
  validateGetCompendiumEntryOutput,
  type ListCompendiumsInput,
  type ListCompendiumsOutput,
  type SearchCompendiumInput,
  type SearchCompendiumOutput,
  type GetCompendiumEntryInput,
  type GetCompendiumEntryOutput,
  type CompendiumMatch,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";
import { collectCompendiumCandidateUuids } from "./search-candidates.js";
import { getActiveProfile, mergeProfileCompendiumExclusions } from "./context-profile.js";

const DEFAULT_LIMIT = 20;

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

function requirePacks(): FoundryCompendiumCollection {
  if (!game.packs) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry compendium collection is unavailable.",
      { retryable: true },
    );
  }
  return game.packs;
}

function excludedPackIds(): Set<string> {
  try {
    const raw = getLoreBridgeSettings().excludedCompendiums;
    const globalExcluded: Set<string> = raw
      ? new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))
      : new Set();
    return mergeProfileCompendiumExclusions(getActiveProfile(), globalExcluded);
  } catch {
    return new Set();
  }
}

function entryUuid(packId: string, documentType: string, entryId: string): string {
  return `Compendium.${packId}.${documentType}.${entryId}`;
}

export function listCompendiums(input: ListCompendiumsInput): ListCompendiumsOutput {
  requireFoundryGm("listCompendiums");
  const validated = validateListCompendiumsInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "List compendiums input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }

  const packs = requirePacks();
  const excluded = excludedPackIds();
  const typeFilter = validated.value.documentType?.toLowerCase();

  const compendiums: ListCompendiumsOutput["compendiums"] = [];
  for (const pack of packs) {
    if (excluded.has(pack.metadata.id)) continue;
    if (typeFilter && pack.metadata.type.toLowerCase() !== typeFilter) continue;
    compendiums.push({
      packId: pack.metadata.id,
      label: pack.metadata.label,
      documentType: pack.metadata.type,
      entryCount: pack.index.size,
    });
  }

  const output: ListCompendiumsOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    compendiums,
  };

  const outputValidation = validateListCompendiumsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid compendium list.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}

export async function searchCompendium(input: SearchCompendiumInput): Promise<SearchCompendiumOutput> {
  requireFoundryGm("searchCompendium");
  const validated = validateSearchCompendiumInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Compendium search input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }

  const packs = requirePacks();
  const excluded = excludedPackIds();
  const { query, packId: filterPackId, documentType: filterType, limit = DEFAULT_LIMIT } = validated.value;
  const needle = query.trim().toLocaleLowerCase();
  const allowedTypes = new Set<string>();
  for (const pack of packs) {
    if (excluded.has(pack.metadata.id)) continue;
    if (filterPackId && pack.metadata.id !== filterPackId) continue;
    if (filterType && pack.metadata.type.toLowerCase() !== filterType.toLowerCase()) continue;
    allowedTypes.add(pack.metadata.type);
  }
  const spotlightCandidates = await collectCompendiumCandidateUuids(query, allowedTypes);
  const results: Array<{ candidate: number; value: CompendiumMatch }> = [];

  for (const pack of packs) {
    if (excluded.has(pack.metadata.id)) continue;
    if (filterPackId && pack.metadata.id !== filterPackId) continue;
    if (filterType && pack.metadata.type.toLowerCase() !== filterType.toLowerCase()) continue;

    const nativeCandidates = new Set<string>();
    try {
      for (const entry of pack.search({ query })) {
        const value = entry as FoundryCompendiumIndexEntry;
        if (typeof value._id === "string") nativeCandidates.add(entryUuid(pack.metadata.id, pack.metadata.type, value._id));
      }
    } catch {
      // The bounded pack-index scanner below remains authoritative.
    }

    for (const entry of pack.index) {
      if (entry.name.toLocaleLowerCase().includes(needle)) {
        const uuid = entryUuid(pack.metadata.id, pack.metadata.type, entry._id);
        results.push({ candidate: spotlightCandidates.has(uuid) || nativeCandidates.has(uuid) ? 0 : 1, value: {
          packId: pack.metadata.id,
          packLabel: pack.metadata.label,
          entryId: entry._id,
          entryUuid: uuid,
          entryName: entry.name,
          documentType: entry.type ?? pack.metadata.type,
          ...(entry.img ? { img: entry.img } : {}),
        } });
      }
    }
  }

  const ranked = results
    .sort((left, right) => Number(right.value.entryName.toLocaleLowerCase() === needle) - Number(left.value.entryName.toLocaleLowerCase() === needle)
      || left.candidate - right.candidate
      || left.value.entryName.localeCompare(right.value.entryName)
      || left.value.entryUuid.localeCompare(right.value.entryUuid))
    .slice(0, limit)
    .map(({ value }) => value);

  const output: SearchCompendiumOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    query: query.trim(),
    results: ranked,
  };

  const outputValidation = validateSearchCompendiumOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid compendium search results.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}

export function getCompendiumEntry(input: GetCompendiumEntryInput): GetCompendiumEntryOutput {
  requireFoundryGm("getCompendiumEntry");
  const validated = validateGetCompendiumEntryInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Compendium entry retrieval input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }

  const packs = requirePacks();
  const excluded = excludedPackIds();
  const { packId, entryId } = validated.value;

  if (excluded.has(packId)) {
    throw new LoreBridgeCapabilityError(
      "NOT_FOUND",
      `Compendium pack "${packId}" is excluded by world settings.`,
    );
  }

  const pack = packs.get(packId);
  if (!pack) {
    throw new LoreBridgeCapabilityError(
      "NOT_FOUND",
      `Compendium pack "${packId}" was not found.`,
    );
  }

  const entry = pack.index.get(entryId);
  if (!entry) {
    throw new LoreBridgeCapabilityError(
      "NOT_FOUND",
      `Entry "${entryId}" was not found in compendium pack "${packId}".`,
    );
  }

  const output: GetCompendiumEntryOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    packId,
    packLabel: pack.metadata.label,
    entryId: entry._id,
    entryUuid: entryUuid(packId, pack.metadata.type, entry._id),
    entryName: entry.name,
    documentType: entry.type ?? pack.metadata.type,
    ...(entry.img ? { img: entry.img } : {}),
  };

  const outputValidation = validateGetCompendiumEntryOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned an invalid compendium entry.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}
