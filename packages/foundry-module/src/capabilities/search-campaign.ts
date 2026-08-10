import {
  validateSearchCampaignInput,
  validateSearchCampaignOutput,
  type CampaignDocumentType,
  type CampaignSearchMatch,
  type SearchCampaignInput,
  type SearchCampaignOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { searchJournals } from "./journals.js";
import { searchActors } from "./actors.js";
import { searchScenes } from "./scenes.js";
import { getActiveProfile, getProfileFilter, hasStaleFolderRefs } from "./context-profile.js";

const DEFAULT_LIMIT = 20;
const INTERNAL_LIMIT = 50;

// Lower score = higher rank. Tie-break by type priority then name.
const TYPE_PRIORITY: Record<CampaignDocumentType, number> = { journal: 0, actor: 1, scene: 2 };

function journalScore(matchedField: string, name: string, query: string): number {
  if (matchedField === "journalName") return name.toLocaleLowerCase() === query ? 0 : 1;
  if (matchedField === "pageName") return 2;
  return 3; // pageText
}

function actorScore(matchedField: string, name: string, query: string): number {
  if (matchedField === "actorName") return name.toLocaleLowerCase() === query ? 0 : 1;
  return 2; // description
}

function sceneScore(name: string, query: string): number {
  return name.toLocaleLowerCase() === query ? 0 : 1;
}

function sortKey(score: number, docType: CampaignDocumentType, name: string): string {
  return `${score}:${TYPE_PRIORITY[docType]}:${name.toLocaleLowerCase()}`;
}

export function searchCampaign(input: SearchCampaignInput): SearchCampaignOutput {
  requireFoundryGm("searchCampaign");
  const validated = validateSearchCampaignInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Campaign search input is invalid.", { details: { validationErrors: validated.errors } });
  }

  const activeProfile = getActiveProfile();
  if (activeProfile && hasStaleFolderRefs(activeProfile)) {
    console.warn(`[LoreBridge] Active profile "${activeProfile.name}" references deleted folders. Continuing with remaining valid folders.`);
  }
  const profileFilter = getProfileFilter(activeProfile);
  const allowedTypes = ["journal", "actor", "scene"] as const;
  const {
    query,
    limit: inputLimit = DEFAULT_LIMIT,
    types = allowedTypes.filter((t) => profileFilter[t === "journal" ? "journals" : t === "actor" ? "actors" : "scenes"]),
    mode: inputMode,
  } = validated.value;
  // Profile caps the limit and overrides the visibility mode when not explicitly supplied.
  // Player-safe profiles always force player visibility regardless of caller input.
  const limit = Math.min(inputLimit, profileFilter.maxDocs);
  const mode = activeProfile?.visibilityMode === "player-safe" ? "player" : (inputMode ?? profileFilter.mode);
  // Filter types to those allowed by the active profile.
  const effectiveTypes = types.filter((t) => {
    if (t === "journal") return profileFilter.journals;
    if (t === "actor") return profileFilter.actors;
    if (t === "scene") return profileFilter.scenes;
    return true;
  });
  const needle = query.trim().toLocaleLowerCase();
  const scored: Array<{ key: string; match: CampaignSearchMatch }> = [];
  let hiddenCount = 0;

  if (effectiveTypes.includes("journal")) {
    try {
      const sub = searchJournals({ query, limit: INTERNAL_LIMIT, ...(mode === undefined ? {} : { mode }) });
      hiddenCount += sub.hiddenCount;
      const { results } = sub;
      for (const r of results) {
        const score = journalScore(r.matchedField, r.journalName, needle);
        scored.push({ key: sortKey(score, "journal", r.journalName), match: { ...r, documentType: "journal" } });
      }
    } catch {
      // Leave journals out if unavailable; other types may still return results.
    }
  }

  if (effectiveTypes.includes("actor")) {
    try {
      const sub = searchActors({ query, limit: INTERNAL_LIMIT, ...(mode === undefined ? {} : { mode }) });
      hiddenCount += sub.hiddenCount;
      const { results } = sub;
      for (const r of results) {
        const score = actorScore(r.matchedField, r.actorName, needle);
        scored.push({ key: sortKey(score, "actor", r.actorName), match: { ...r, documentType: "actor" } });
      }
    } catch {
      // Leave actors out if unavailable.
    }
  }

  if (effectiveTypes.includes("scene")) {
    try {
      const sub = searchScenes({ query, limit: INTERNAL_LIMIT, ...(mode === undefined ? {} : { mode }) });
      hiddenCount += sub.hiddenCount;
      const { results } = sub;
      for (const r of results) {
        const score = sceneScore(r.sceneName, needle);
        scored.push({ key: sortKey(score, "scene", r.sceneName), match: { ...r, documentType: "scene" } });
      }
    } catch {
      // Leave scenes out if unavailable.
    }
  }

  if (scored.length === 0 && effectiveTypes.length > 0) {
    // Verify at least one collection is reachable — surface the error if all failed.
    if (!game.journal && !game.actors && !game.scenes) {
      throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "No Foundry document collections are available.", { retryable: true });
    }
  }

  // Apply folder filter: re-resolve each matched document and check its current folder.
  // This is done after sub-search so Spotlight or native search candidates are rechecked
  // against live Foundry state before being ranked or returned.
  const folderIds = profileFilter.folderIds;
  const filteredScored = folderIds && folderIds.size > 0
    ? scored.filter(({ match }) => {
        if (match.documentType === "journal") {
          const journal = game.journal?.get(match.journalId);
          if (!journal) return false;
          return folderIds.has(journal.folder?.id ?? "");
        }
        if (match.documentType === "actor") {
          const actor = game.actors?.get(match.actorId);
          if (!actor) return false;
          return folderIds.has(actor.folder?.id ?? "");
        }
        if (match.documentType === "scene") {
          const scene = game.scenes?.get(match.sceneId);
          if (!scene) return false;
          return folderIds.has(scene.folder?.id ?? "");
        }
        return true;
      })
    : scored;

  const results = filteredScored
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    .slice(0, limit)
    .map(({ match }) => match);

  const sourceId = game.world ? `foundry:${game.world.id}` : "foundry:unknown";
  const sourceName = game.world?.title ?? "Unknown Foundry World";

  const output: SearchCampaignOutput = { sourceId, sourceName, query: query.trim(), results, hiddenCount };
  const outputValidation = validateSearchCampaignOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned invalid campaign search results.", { details: { validationErrors: outputValidation.errors } });
  }
  return outputValidation.value;
}
