const MODULE_ID = "lorebridge";
const PROFILES_KEY = "contextProfiles";
const ACTIVE_ID_KEY = "activeContextProfileId";

export type ContextProfileDocType = "journal" | "actor" | "scene";
export type ContextProfileVisibility = "all" | "player-safe" | "gm-only";

export type ContextProfile = {
  id: string;
  name: string;
  allowedDocTypes: ContextProfileDocType[];
  visibilityMode: ContextProfileVisibility;
  maxDocs: number;
  /** When true, always include the active scene regardless of allowedDocTypes. */
  includeActiveScene?: boolean;
  /** Pack IDs excluded by this profile (merged with the global setting). */
  excludedCompendiums?: string[];
  /** Foundry folder IDs this profile is restricted to (empty = no folder restriction). */
  allowedFolderIds?: string[];
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export function getContextProfiles(): ContextProfile[] {
  try {
    const raw = String(game.settings.get(MODULE_ID, PROFILES_KEY) ?? "[]");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidProfile);
  } catch {
    return [];
  }
}

export async function saveContextProfiles(profiles: ContextProfile[]): Promise<void> {
  await (game.settings as unknown as { set(m: string, k: string, v: unknown): Promise<unknown> })
    .set(MODULE_ID, PROFILES_KEY, JSON.stringify(profiles));
}

export function getActiveProfileId(): string {
  return String(game.settings.get(MODULE_ID, ACTIVE_ID_KEY) ?? "").trim();
}

export function getActiveProfile(): ContextProfile | null {
  const id = getActiveProfileId();
  if (!id) return null;
  return getContextProfiles().find((p) => p.id === id) ?? null;
}

export async function setActiveProfileId(id: string): Promise<void> {
  await (game.settings as unknown as { set(m: string, k: string, v: unknown): Promise<unknown> })
    .set(MODULE_ID, ACTIVE_ID_KEY, id);
}

// ---------------------------------------------------------------------------
// Profile application
// ---------------------------------------------------------------------------

export type ProfileDocTypeFilter = {
  journals: boolean;
  actors: boolean;
  scenes: boolean;
  /** Search visibility mode: "player" filters to player-visible docs, undefined means no filter. */
  mode: "gm" | "player" | undefined;
  maxDocs: number;
  /** Folder IDs this filter is restricted to. Undefined or empty Set means no restriction. */
  folderIds?: Set<string>;
};

export function getProfileFilter(profile: ContextProfile | null): ProfileDocTypeFilter {
  if (!profile) {
    return { journals: true, actors: true, scenes: true, mode: undefined, maxDocs: 200 };
  }
  const types = profile.allowedDocTypes;
  // "player-safe" → pass mode:"player" to exclude GM-only docs from results
  // "gm-only" → no direct search filter available; profile restricts doc types only
  // "all" → no mode filter
  const mode: "player" | undefined = profile.visibilityMode === "player-safe" ? "player" : undefined;
  const filter: ProfileDocTypeFilter = {
    journals: types.includes("journal"),
    actors: types.includes("actor"),
    scenes: types.includes("scene"),
    mode,
    maxDocs: profile.maxDocs,
  };
  if (profile.allowedFolderIds && profile.allowedFolderIds.length > 0) {
    filter.folderIds = new Set(profile.allowedFolderIds);
  }
  return filter;
}

/**
 * Returns profile-level excluded compendium pack IDs merged with a base set.
 * Pass the global setting's exclusion set as `globalExcluded`.
 */
export function mergeProfileCompendiumExclusions(
  profile: ContextProfile | null,
  globalExcluded: Set<string>,
): Set<string> {
  if (!profile?.excludedCompendiums?.length) return globalExcluded;
  const merged = new Set(globalExcluded);
  for (const id of profile.excludedCompendiums) merged.add(id);
  return merged;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidProfile(x: unknown): x is ContextProfile {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  if (typeof p["id"] !== "string" || !p["id"]) return false;
  if (typeof p["name"] !== "string" || !p["name"]) return false;
  if (!Array.isArray(p["allowedDocTypes"])) return false;
  if (!["all", "player-safe", "gm-only"].includes(p["visibilityMode"] as string)) return false;
  if (typeof p["maxDocs"] !== "number" || p["maxDocs"] < 1) return false;
  // Optional fields
  if (p["includeActiveScene"] !== undefined && typeof p["includeActiveScene"] !== "boolean") return false;
  if (p["excludedCompendiums"] !== undefined && !Array.isArray(p["excludedCompendiums"])) return false;
  if (p["allowedFolderIds"] !== undefined && !Array.isArray(p["allowedFolderIds"])) return false;
  return true;
}

export function makeProfile(
  name: string,
  allowedDocTypes: ContextProfileDocType[],
  visibilityMode: ContextProfileVisibility,
  maxDocs: number,
  id?: string,
  includeActiveScene?: boolean,
  excludedCompendiums?: string[],
  allowedFolderIds?: string[],
): ContextProfile {
  const profile: ContextProfile = {
    id: id ?? crypto.randomUUID(),
    name: name.trim(),
    allowedDocTypes,
    visibilityMode,
    maxDocs,
  };
  if (includeActiveScene) profile.includeActiveScene = true;
  if (excludedCompendiums && excludedCompendiums.length > 0) profile.excludedCompendiums = excludedCompendiums;
  if (allowedFolderIds && allowedFolderIds.length > 0) profile.allowedFolderIds = allowedFolderIds;
  return profile;
}

/**
 * Returns true if the profile references folder IDs that no longer exist in the current world.
 * Requires `game.folders` to be available (Foundry client context only).
 */
export function hasStaleFolderRefs(profile: ContextProfile): boolean {
  if (!profile.allowedFolderIds || profile.allowedFolderIds.length === 0) return false;
  const folders = (game as unknown as { folders?: { get(id: string): unknown | undefined } }).folders;
  if (!folders) return false;
  for (const fid of profile.allowedFolderIds) {
    if (!folders.get(fid)) return true;
  }
  return false;
}
