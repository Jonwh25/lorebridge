import {
  validateListCompendiumsInput,
  validateListCompendiumsOutput,
  validateSearchCompendiumInput,
  validateSearchCompendiumOutput,
  validateGetCompendiumEntryInput,
  validateGetCompendiumEntryOutput,
  SUPPORTED_COMPENDIUM_CONTENT_TYPES,
  type CompendiumEntryContent,
  type CompendiumItemContent,
  type CompendiumActorContent,
  type CompendiumJournalEntryContent,
  type CompendiumJournalPageContent,
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
import { plainText } from "../utils/html.js";

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

const CONTENT_DESCRIPTION_LIMIT = 10_000;
const JOURNAL_PAGE_TEXT_LIMIT = 20_000;
const JOURNAL_PAGES_LIMIT = 20;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textField(doc: Record<string, unknown>, ...keys: string[]): string | undefined {
  let cur: unknown = doc;
  for (const k of keys) {
    if (!isRecord(cur)) return undefined;
    cur = cur[k];
  }
  if (typeof cur === "string") return cur || undefined;
  if (isRecord(cur)) {
    for (const k of ["value", "content", "public"]) {
      if (typeof cur[k] === "string" && cur[k]) return cur[k] as string;
    }
  }
  return undefined;
}

function numField(doc: unknown, key: string): number | undefined {
  if (!isRecord(doc)) return undefined;
  const v = doc[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function extractItemContent(doc: Record<string, unknown>): CompendiumItemContent {
  const sys = isRecord(doc.system) ? doc.system : {};
  const content: CompendiumItemContent = { contentType: "item" };

  const descRaw = textField(sys, "description") ?? textField(doc, "description");
  if (descRaw) content.description = plainText(descRaw).slice(0, CONTENT_DESCRIPTION_LIMIT);

  const qty = numField(sys, "quantity");
  if (qty !== undefined) content.quantity = qty;

  const wRaw = sys.weight;
  const w = numField(wRaw, "value") ?? (typeof wRaw === "number" && Number.isFinite(wRaw) ? wRaw as number : undefined);
  if (w !== undefined) content.weight = w;

  const pRaw = sys.price;
  if (typeof pRaw === "string" && pRaw.trim()) content.price = pRaw.trim();
  else if (isRecord(pRaw) && typeof pRaw.value === "number") {
    const denom = typeof pRaw.denomination === "string" ? pRaw.denomination : "";
    content.price = denom ? `${pRaw.value} ${denom}` : String(pRaw.value);
  }

  const rarity = typeof sys.rarity === "string" && sys.rarity ? sys.rarity : undefined;
  if (rarity) content.rarity = rarity;

  const identified = typeof sys.identified === "boolean" ? sys.identified : undefined;
  if (identified !== undefined) content.identified = identified;

  const act = sys.activation;
  if (isRecord(act)) {
    const type = typeof act.type === "string" && act.type ? act.type : undefined;
    const cost = numField(act, "cost");
    const condition = typeof act.condition === "string" && act.condition.trim() ? act.condition.trim() : undefined;
    if (type || cost !== undefined || condition) {
      content.activation = { ...(type ? { type } : {}), ...(cost !== undefined ? { cost } : {}), ...(condition ? { condition } : {}) };
    }
  }

  const tgt = sys.target;
  if (isRecord(tgt)) {
    const value = numField(tgt, "value");
    const units = typeof tgt.units === "string" && tgt.units ? tgt.units : undefined;
    const type = typeof tgt.type === "string" && tgt.type ? tgt.type : undefined;
    if (value !== undefined || units || type) {
      content.target = { ...(value !== undefined ? { value } : {}), ...(units ? { units } : {}), ...(type ? { type } : {}) };
    }
  }

  const rng = sys.range;
  if (isRecord(rng)) {
    const value = numField(rng, "value");
    const long = numField(rng, "long");
    const units = typeof rng.units === "string" && rng.units ? rng.units : undefined;
    if (value !== undefined || (long !== undefined && long > 0) || units) {
      content.range = { ...(value !== undefined ? { value } : {}), ...(long !== undefined && long > 0 ? { long } : {}), ...(units ? { units } : {}) };
    }
  }

  const dur = sys.duration;
  if (isRecord(dur)) {
    const value = numField(dur, "value");
    const units = typeof dur.units === "string" && dur.units ? dur.units : undefined;
    if (value !== undefined || units) {
      content.duration = { ...(value !== undefined ? { value } : {}), ...(units ? { units } : {}) };
    }
  }

  const uses = sys.uses;
  if (isRecord(uses)) {
    const value = numField(uses, "value");
    const max = numField(uses, "max");
    const per = typeof uses.per === "string" && uses.per ? uses.per : typeof uses.recovery === "string" && uses.recovery ? uses.recovery : undefined;
    if (value !== undefined || max !== undefined || per) {
      content.uses = { ...(value !== undefined ? { value } : {}), ...(max !== undefined ? { max } : {}), ...(per ? { per } : {}) };
    }
  }

  const dmg = sys.damage;
  if (isRecord(dmg) && Array.isArray(dmg.parts)) {
    const formulas: string[] = [];
    for (const part of dmg.parts) {
      if (Array.isArray(part) && typeof part[0] === "string" && part[0].trim()) {
        formulas.push(part[1] ? `${part[0].trim()} (${part[1]})` : part[0].trim());
      } else if (isRecord(part) && typeof part.formula === "string" && part.formula.trim()) {
        formulas.push(part.type ? `${part.formula.trim()} (${part.type})` : part.formula.trim());
      }
    }
    if (typeof dmg.versatile === "string" && dmg.versatile.trim()) formulas.push(`${dmg.versatile.trim()} (versatile)`);
    if (formulas.length > 0) content.damageFormulas = formulas;
  }

  const save = sys.save;
  if (isRecord(save)) {
    const ability = typeof save.ability === "string" && save.ability ? save.ability : undefined;
    const dc = numField(save, "dc") ?? numField(save, "flat");
    if (ability || dc !== undefined) {
      content.save = { ...(ability ? { ability } : {}), ...(dc !== undefined ? { dc } : {}) };
    }
  }

  const props = sys.properties;
  let properties: string[] | undefined;
  if (props instanceof Set) {
    properties = Array.from(props as Set<unknown>).filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  } else if (isRecord(props)) {
    properties = Object.entries(props).filter(([, v]) => v === true).map(([k]) => k);
  } else if (Array.isArray(props)) {
    properties = props.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  }
  if (properties && properties.length > 0) content.properties = properties;

  return content;
}

function extractActorContent(doc: Record<string, unknown>): CompendiumActorContent {
  const sys = isRecord(doc.system) ? doc.system : {};
  const actorType = typeof doc.type === "string" ? doc.type : "unknown";
  const content: CompendiumActorContent = { contentType: "actor", actorType };

  const descRaw = textField(sys, "details", "biography") ?? textField(sys, "biography") ?? textField(sys, "description") ?? textField(sys, "details", "description");
  if (descRaw) content.description = plainText(descRaw).slice(0, CONTENT_DESCRIPTION_LIMIT);

  return content;
}

function extractJournalEntryContent(doc: Record<string, unknown>): CompendiumJournalEntryContent {
  const pagesRaw = doc.pages;
  const pages: CompendiumJournalEntryContent["pages"] = [];
  if (Array.isArray(pagesRaw)) {
    for (const page of pagesRaw.slice(0, JOURNAL_PAGES_LIMIT)) {
      if (!isRecord(page)) continue;
      const name = typeof page.name === "string" ? page.name : "";
      const type = typeof page.type === "string" ? page.type : "text";
      let text: string | undefined;
      const textData = page.text;
      if (isRecord(textData) && typeof textData.content === "string") {
        text = plainText(textData.content).slice(0, JOURNAL_PAGE_TEXT_LIMIT);
      } else if (typeof textData === "string") {
        text = plainText(textData).slice(0, JOURNAL_PAGE_TEXT_LIMIT);
      }
      pages.push({ name, type, ...(text ? { text } : {}) });
    }
  }
  return { contentType: "journalEntry", pages };
}

function extractJournalPageContent(doc: Record<string, unknown>): CompendiumJournalPageContent {
  const pageType = typeof doc.type === "string" ? doc.type : "text";
  const content: CompendiumJournalPageContent = { contentType: "journalEntryPage", pageType };
  const textData = doc.text;
  if (isRecord(textData) && typeof textData.content === "string") {
    const t = plainText(textData.content).slice(0, JOURNAL_PAGE_TEXT_LIMIT);
    if (t) content.text = t;
  } else if (typeof textData === "string" && textData) {
    content.text = plainText(textData).slice(0, JOURNAL_PAGE_TEXT_LIMIT);
  }
  return content;
}

async function extractEntryContent(pack: FoundryCompendiumPack, entryId: string, documentType: string): Promise<CompendiumEntryContent | undefined> {
  const supported = new Set<string>(SUPPORTED_COMPENDIUM_CONTENT_TYPES);
  if (!supported.has(documentType)) return undefined;

  const doc = await pack.getDocument(entryId);
  if (!doc) return undefined;
  const raw = doc.toObject();

  if (documentType === "Item") return extractItemContent(raw);
  if (documentType === "Actor") return extractActorContent(raw);
  if (documentType === "JournalEntry") return extractJournalEntryContent(raw);
  if (documentType === "JournalEntryPage") return extractJournalPageContent(raw);
  return undefined;
}

export async function getCompendiumEntry(input: GetCompendiumEntryInput): Promise<GetCompendiumEntryOutput> {
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

  const packType = pack.metadata.type;
  const entrySubtype = entry.type ?? packType;
  const supported = new Set<string>(SUPPORTED_COMPENDIUM_CONTENT_TYPES);
  if (!supported.has(packType)) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      `Compendium entry content is not supported for document type "${packType}". Supported types: ${SUPPORTED_COMPENDIUM_CONTENT_TYPES.join(", ")}.`,
    );
  }

  const content = await extractEntryContent(pack, entryId, packType);

  const output: GetCompendiumEntryOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    packId,
    packLabel: pack.metadata.label,
    entryId: entry._id,
    entryUuid: entryUuid(packId, pack.metadata.type, entry._id),
    entryName: entry.name,
    documentType: entrySubtype,
    ...(entry.img ? { img: entry.img } : {}),
    ...(content ? { content } : {}),
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
