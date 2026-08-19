export type CandidateDocumentType = "Actor" | "Item" | "JournalEntry" | "JournalEntryPage" | "RollTable" | "Scene";

type SearchableDocument = { id: string; uuid: string; name: string };
type SearchableCollection<T extends SearchableDocument> = Iterable<T> & {
  search?(search: { query?: string; exclude?: string[] }): T[] | object[];
};

type SpotlightTerm = {
  match?: (query: string) => boolean;
  data?: unknown;
  documentName?: unknown;
  uuid?: unknown;
  onClick?: unknown;
};

type SpotlightApi = {
  INDEX: Iterable<SpotlightTerm>;
  SearchTerm: unknown;
  rebuildIndex: () => Promise<unknown> | unknown;
};

const ALLOWED_TYPES = new Set<CandidateDocumentType>([
  "Actor",
  "Item",
  "JournalEntry",
  "JournalEntryPage",
  "RollTable",
  "Scene",
]);

let scheduledBuild = false;
let buildPromise: Promise<unknown> | undefined;
let warnedUnavailable = false;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function spotlightApi(): SpotlightApi | undefined {
  const api = record((globalThis as unknown as { CONFIG?: unknown }).CONFIG)?.["SpotlightOmnisearch"];
  const value = record(api);
  if (!value || !(Symbol.iterator in Object(value["INDEX"]))) return undefined;
  if (value["SearchTerm"] === undefined || typeof value["rebuildIndex"] !== "function") return undefined;
  return value as unknown as SpotlightApi;
}

export function spotlightApiAvailable(): boolean {
  return spotlightApi() !== undefined;
}

function warnSpotlightUnavailable(): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn("LoreBridge | Spotlight Omnisearch 4.0.2 API is unavailable; using native search and bounded scanner fallback.");
}

function scheduleSpotlightBuild(api: SpotlightApi): void {
  if (scheduledBuild || buildPromise) return;
  scheduledBuild = true;
  queueMicrotask(() => {
    try {
      buildPromise = Promise.resolve(api.rebuildIndex()).catch(() => undefined).finally(() => {
        buildPromise = undefined;
      });
    } catch {
      buildPromise = undefined;
    }
  });
}

function termIdentity(term: SpotlightTerm): { uuid: string; documentType: CandidateDocumentType } | undefined {
  // Spotlight terms are advisory only. Read the minimum identity fields and never
  // return the term, its data object, or any callback across the adapter boundary.
  const data = record(term.data);
  const uuid = typeof term.uuid === "string"
    ? term.uuid
    : typeof data?.["uuid"] === "string" ? data["uuid"] : undefined;
  const documentType = typeof term.documentName === "string"
    ? term.documentName
    : typeof data?.["documentName"] === "string" ? data["documentName"] : undefined;
  if (!uuid || !documentType || !ALLOWED_TYPES.has(documentType as CandidateDocumentType)) return undefined;
  return { uuid, documentType: documentType as CandidateDocumentType };
}

function matchingSpotlightIdentities(query: string, allowedType?: CandidateDocumentType): Array<{ uuid: string; documentType: CandidateDocumentType }> {
  const api = spotlightApi();
  if (!api) {
    warnSpotlightUnavailable();
    return [];
  }
  const terms = Array.from(api.INDEX);
  if (terms.length === 0) {
    scheduleSpotlightBuild(api);
    return [];
  }
  const matches: Array<{ uuid: string; documentType: CandidateDocumentType }> = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const identity = termIdentity(term);
    if (!identity || (allowedType && identity.documentType !== allowedType) || seen.has(identity.uuid)) continue;
    let matched = false;
    try { matched = term.match?.(query.toLocaleLowerCase()) === true; } catch { matched = false; }
    if (!matched) continue;
    seen.add(identity.uuid);
    matches.push(identity);
  }
  return matches;
}

function liveNameMatches(document: unknown, query: string): document is SearchableDocument {
  const value = record(document);
  return typeof value?.["id"] === "string"
    && typeof value["uuid"] === "string"
    && typeof value["name"] === "string"
    && value["name"].toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function spotlightCandidates(query: string, allowedType: CandidateDocumentType): SearchableDocument[] {
  const results: SearchableDocument[] = [];
  for (const identity of matchingSpotlightIdentities(query, allowedType)) {
    let resolved: unknown;
    try { resolved = globalThis.fromUuidSync(identity.uuid); } catch { continue; }
    if (!liveNameMatches(resolved, query) || resolved.uuid !== identity.uuid) continue;
    results.push(resolved);
  }
  return results;
}

export async function collectCompendiumCandidateUuids(
  query: string,
  allowedTypes: ReadonlySet<string>,
): Promise<Set<string>> {
  const candidates = new Set<string>();
  for (const identity of matchingSpotlightIdentities(query)) {
    if (!identity.uuid.startsWith("Compendium.") || !allowedTypes.has(identity.documentType)) continue;
    let resolved: unknown;
    try { resolved = await globalThis.fromUuid(identity.uuid); } catch { continue; }
    if (!liveNameMatches(resolved, query) || resolved.uuid !== identity.uuid) continue;
    candidates.add(identity.uuid);
  }
  return candidates;
}

export function collectWorldCandidateUuids<T extends SearchableDocument>(
  query: string,
  documentType: CandidateDocumentType,
  collection: SearchableCollection<T>,
): Set<string> {
  const candidates = new Set<string>();
  for (const document of spotlightCandidates(query, documentType)) candidates.add(document.uuid);
  try {
    for (const result of collection.search?.({ query }) ?? []) {
      if (liveNameMatches(result, query)) candidates.add(result.uuid);
    }
  } catch {
    // Native search is an optimization layer; bounded scanners remain authoritative.
  }
  return candidates;
}

function liveJournalPageMatches(document: unknown, query: string): document is SearchableDocument {
  const value = record(document);
  if (typeof value?.["id"] !== "string" || typeof value["uuid"] !== "string" || typeof value["name"] !== "string") return false;
  const needle = query.toLocaleLowerCase();
  if (value["name"].toLocaleLowerCase().includes(needle)) return true;
  const text = record(value["text"]);
  return typeof text?.["content"] === "string"
    && text["content"].replace(/<[^>]*>/g, " ").toLocaleLowerCase().includes(needle);
}

export function collectJournalCandidateUuids<T extends SearchableDocument>(
  query: string,
  collection: SearchableCollection<T>,
): Set<string> {
  const candidates = collectWorldCandidateUuids(query, "JournalEntry", collection);
  for (const identity of matchingSpotlightIdentities(query, "JournalEntryPage")) {
    if (!identity.uuid.startsWith("JournalEntry.")) continue;
    let page: unknown;
    try { page = globalThis.fromUuidSync(identity.uuid); } catch { continue; }
    if (!liveJournalPageMatches(page, query) || record(page)?.["uuid"] !== identity.uuid) continue;
    const parts = identity.uuid.split(".");
    if (parts.length >= 2) candidates.add(`JournalEntry.${parts[1]}`);
  }
  return candidates;
}

export function resetSearchCandidateLifecycleForTests(): void {
  scheduledBuild = false;
  buildPromise = undefined;
  warnedUnavailable = false;
}
