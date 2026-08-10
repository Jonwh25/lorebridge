import {
  validateAuditCampaignConsistencyInput,
  validateAuditCampaignConsistencyOutput,
  CONSISTENCY_AUDIT_DEFAULT_LIMIT,
  type AuditCampaignConsistencyInput,
  type AuditCampaignConsistencyOutput,
  type ConsistencyFinding,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";
import { getActiveProfile, getProfileFilter, type ProfileDocTypeFilter } from "./context-profile.js";
import { isPlayerVisible } from "./visibility.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DOCUMENTS = 50;
const MAX_CHARS_PER_DOC = 700;

// ---------------------------------------------------------------------------
// HTML stripping
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Content document type
// ---------------------------------------------------------------------------

type ContentDocument = {
  uuid: string;
  name: string;
  type: "journal-page" | "actor" | "scene";
  content: string;
};

// ---------------------------------------------------------------------------
// Content gathering
// ---------------------------------------------------------------------------

function scoreRelevance(name: string, content: string, focus: string): number {
  const lowerFocus = focus.toLowerCase();
  const lowerName = name.toLowerCase();
  const lowerContent = content.toLowerCase();
  if (lowerName === lowerFocus) return 3;
  if (lowerName.includes(lowerFocus)) return 2;
  if (lowerContent.includes(lowerFocus)) return 1;
  return 0;
}

function gatherDocuments(focus?: string, filter?: ProfileDocTypeFilter, includeActiveScene?: boolean): ContentDocument[] {
  const playerMode = filter?.mode === "player";
  const maxDocs = filter?.maxDocs ?? MAX_DOCUMENTS;
  const docs: ContentDocument[] = [];

  // Journal pages
  if (!filter || filter.journals) {
    for (const journal of game.journal ?? []) {
      if (playerMode && !isPlayerVisible(journal.ownership)) continue;
      for (const page of journal.pages) {
        const html = page.text?.content ?? "";
        if (!html) continue;
        const content = truncate(stripHtml(html), MAX_CHARS_PER_DOC);
        if (!content) continue;
        docs.push({
          uuid: `JournalEntry.${journal.id}.JournalEntryPage.${page.id}`,
          name: `${journal.name} → ${page.name}`,
          type: "journal-page",
          content,
        });
      }
    }
  }

  // Actors (biography text)
  if (!filter || filter.actors) {
    for (const actor of game.actors ?? []) {
      if (playerMode && !isPlayerVisible(actor.ownership)) continue;
      const system = actor.system as Record<string, unknown>;
      const paths: string[][] = [
        ["details", "biography", "value"],
        ["details", "biography"],
        ["biography", "value"],
        ["description", "value"],
        ["details", "description"],
      ];
      let bio = "";
      for (const path of paths) {
        let node: unknown = system;
        for (const key of path) node = (node as Record<string, unknown>)?.[key];
        if (typeof node === "string" && node.length > 0) { bio = node; break; }
      }
      if (!bio) continue;
      const content = truncate(stripHtml(bio), MAX_CHARS_PER_DOC);
      if (!content) continue;
      docs.push({
        uuid: `Actor.${actor.id}`,
        name: actor.name,
        type: "actor",
        content,
      });
    }
  }

  // Scenes (description if available)
  const activeSceneId = (game.scenes as unknown as { active?: { id: string } })?.active?.id;
  const sceneAllowed = !filter || filter.scenes;
  for (const scene of game.scenes ?? []) {
    const isActive = scene.id === activeSceneId;
    // Include scene if: scenes allowed by filter, OR includeActiveScene flag is set and this is the active scene
    if (!sceneAllowed && !(includeActiveScene && isActive)) continue;
    if (playerMode && !isPlayerVisible((scene as unknown as { ownership?: Record<string, number> }).ownership)) continue;
    const desc = (scene as unknown as { description?: string }).description ?? "";
    if (!desc) continue;
    const content = truncate(stripHtml(desc), MAX_CHARS_PER_DOC);
    if (!content) continue;
    docs.push({
      uuid: `Scene.${scene.id}`,
      name: scene.name,
      type: "scene",
      content,
    });
  }

  // Sort by relevance to focus, then truncate to profile maxDocs
  if (focus) {
    docs.sort((a, b) => scoreRelevance(b.name, b.content, focus) - scoreRelevance(a.name, a.content, focus));
  }

  return docs.slice(0, maxDocs);
}

// ---------------------------------------------------------------------------
// Backend call
// ---------------------------------------------------------------------------

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function callConsistencyAudit(
  documents: ContentDocument[],
  worldName: string,
  focus?: string,
  limit?: number,
): Promise<{ findings: ConsistencyFinding[]; model: string }> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "LoreBridge backend is not configured or paired.", { retryable: false });
  }

  const url = buildBackendUrl(settings.backendUrl, "v1/audit/consistency");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ documents, worldName, focus, limit }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
    const code = err?.error?.code ?? `http_${response.status}`;
    const message = err?.error?.message ?? `Backend error ${response.status}`;
    if (response.status === 503) {
      throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", message, { retryable: false });
    }
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message, { details: { code } });
  }

  const data = await response.json() as { findings: ConsistencyFinding[]; model: string };
  return data;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function auditCampaignConsistency(
  input: AuditCampaignConsistencyInput,
): Promise<AuditCampaignConsistencyOutput> {
  requireFoundryGm("auditCampaignConsistency");

  const validated = validateAuditCampaignConsistencyInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Consistency audit input is invalid.", {
      details: { validationErrors: validated.errors },
    });
  }

  if (!game.world) {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  }

  const { focus, limit = CONSISTENCY_AUDIT_DEFAULT_LIMIT } = validated.value;

  const activeProfile = getActiveProfile();
  const filter = getProfileFilter(activeProfile);
  const documents = gatherDocuments(focus, filter, activeProfile?.includeActiveScene);
  if (documents.length === 0) {
    const output: AuditCampaignConsistencyOutput = {
      sourceId: `foundry:${game.world.id}`,
      sourceName: game.world.title,
      findings: [],
      documentsAnalyzed: 0,
      model: "none",
    };
    return output;
  }

  const { findings, model } = await callConsistencyAudit(documents, game.world.title, focus, limit);

  const output: AuditCampaignConsistencyOutput = {
    sourceId: `foundry:${game.world.id}`,
    sourceName: game.world.title,
    findings: findings.slice(0, limit),
    documentsAnalyzed: documents.length,
    model,
  };

  const outputValidation = validateAuditCampaignConsistencyOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Consistency audit produced invalid output.", {
      details: { validationErrors: outputValidation.errors },
    });
  }
  return outputValidation.value;
}
