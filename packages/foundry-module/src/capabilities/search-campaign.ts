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

  const { query, limit = DEFAULT_LIMIT, types = ["journal", "actor", "scene"] } = validated.value;
  const needle = query.trim().toLocaleLowerCase();
  const scored: Array<{ key: string; match: CampaignSearchMatch }> = [];

  if (types.includes("journal")) {
    try {
      const { results } = searchJournals({ query, limit: INTERNAL_LIMIT });
      for (const r of results) {
        const score = journalScore(r.matchedField, r.journalName, needle);
        scored.push({ key: sortKey(score, "journal", r.journalName), match: { ...r, documentType: "journal" } });
      }
    } catch {
      // Leave journals out if unavailable; other types may still return results.
    }
  }

  if (types.includes("actor")) {
    try {
      const { results } = searchActors({ query, limit: INTERNAL_LIMIT });
      for (const r of results) {
        const score = actorScore(r.matchedField, r.actorName, needle);
        scored.push({ key: sortKey(score, "actor", r.actorName), match: { ...r, documentType: "actor" } });
      }
    } catch {
      // Leave actors out if unavailable.
    }
  }

  if (types.includes("scene")) {
    try {
      const { results } = searchScenes({ query, limit: INTERNAL_LIMIT });
      for (const r of results) {
        const score = sceneScore(r.sceneName, needle);
        scored.push({ key: sortKey(score, "scene", r.sceneName), match: { ...r, documentType: "scene" } });
      }
    } catch {
      // Leave scenes out if unavailable.
    }
  }

  if (scored.length === 0 && types.length > 0) {
    // Verify at least one collection is reachable — surface the error if all failed.
    if (!game.journal && !game.actors && !game.scenes) {
      throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "No Foundry document collections are available.", { retryable: true });
    }
  }

  const results = scored
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    .slice(0, limit)
    .map(({ match }) => match);

  const sourceId = game.world ? `foundry:${game.world.id}` : "foundry:unknown";
  const sourceName = game.world?.title ?? "Unknown Foundry World";

  const output: SearchCampaignOutput = { sourceId, sourceName, query: query.trim(), results };
  const outputValidation = validateSearchCampaignOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned invalid campaign search results.", { details: { validationErrors: outputValidation.errors } });
  }
  return outputValidation.value;
}
