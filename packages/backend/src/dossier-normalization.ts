/**
 * Campaign Codex NPC Dossier normalization.
 *
 * Converts the structured NpcDossierData model (stored in Campaign Codex widget
 * flags) into bounded, player-safe text context for AI generation and roleplay.
 * This module has no Foundry or Campaign Codex dependency and can be tested
 * without a running world.
 */

import type { NpcDossierData } from "@lorebridge/shared";

export type { NpcDossierData };
export type { NpcDossierGoal, NpcDossierConditional, NpcDossierQa, NpcDossierKnowledge } from "@lorebridge/shared";

// ---------------------------------------------------------------------------
// Schema validation and migration
// ---------------------------------------------------------------------------

export function isNpcDossierData(value: unknown): value is NpcDossierData {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  if (d["schemaVersion"] !== 1) return false;
  if (typeof d["reference"] !== "object" || d["reference"] === null) return false;
  if (typeof d["identity"] !== "object" || d["identity"] === null) return false;
  if (typeof d["overview"] !== "object" || d["overview"] === null) return false;
  if (typeof d["roleplay"] !== "object" || d["roleplay"] === null) return false;
  if (!Array.isArray(d["conditionalInfo"])) return false;
  if (!Array.isArray(d["qa"])) return false;
  if (!Array.isArray(d["knowledge"])) return false;
  return true;
}

/** Migrate unknown stored data to the current schema, or return null if not recoverable. */
export function migrateDossierData(raw: unknown): NpcDossierData | null {
  if (isNpcDossierData(raw)) return raw;
  return null;
}

// ---------------------------------------------------------------------------
// Provenance constant
// ---------------------------------------------------------------------------

export const DOSSIER_PROVENANCE = "campaign-codex:npc-dossier";

// ---------------------------------------------------------------------------
// Player-safe secret stripping
// ---------------------------------------------------------------------------

const SECRET_BLOCK_RE = /<section[^>]+class="[^"]*secret[^"]*"[^>]*>[\s\S]*?<\/section>/gi;

/** Strip Foundry native `<section class="secret">` blocks from HTML. */
export function stripSecrets(html: string): string {
  return html.replace(SECRET_BLOCK_RE, "").trim();
}

// ---------------------------------------------------------------------------
// Normalization — convert dossier to bounded text for AI context
// ---------------------------------------------------------------------------

function line(label: string, value: string): string {
  return value.trim() ? `${label}: ${value.trim()}` : "";
}

function nonEmpty(parts: string[]): string[] {
  return parts.filter(Boolean);
}

/**
 * Convert NpcDossierData to a bounded text summary for AI generation context.
 * When isGM=false the secrets narrative is excluded.
 */
export function normalizeDossierToContext(
  dossier: NpcDossierData,
  isGM = true,
): string {
  const parts: string[] = [];

  // Reference
  const ref = dossier.reference;
  const refParts = nonEmpty([
    line("Nicknames", ref.nicknames),
    line("Source", ref.sourceBook + (ref.sourcePage ? ` p.${ref.sourcePage}` : "")),
    line("Stat Block", ref.statBlockReference),
    line("Stat Block Alterations", ref.statBlockAlterations),
  ]);
  if (refParts.length) {
    parts.push("== Reference ==");
    parts.push(...refParts);
  }

  // Identity
  const id = dossier.identity;
  const idParts = nonEmpty([
    line("Gender", id.sexOrGender),
    line("Race", id.race),
    line("Age", id.age),
    line("Alignment", id.alignment),
    line("Height", id.height),
    line("Weight", id.weight),
    line("Eyes", id.eyes),
    line("Hair", id.hair),
    line("Occupation/Class", id.occupationOrClass),
    line("Appearance", id.appearance),
  ]);
  if (idParts.length) {
    parts.push("== Identity ==");
    parts.push(...idParts);
  }

  // Overview bullets (max 10)
  const bullets = dossier.overview.bullets.filter(b => b.trim()).slice(0, 10);
  if (bullets.length) {
    parts.push("== Overview ==");
    parts.push(...bullets.map(b => `- ${b.trim()}`));
  }

  const rels = dossier.overview.relationships.filter(r => r.name.trim() || r.description.trim());
  if (rels.length) {
    parts.push(...rels.map(r => line(r.name || "Relationship", r.description)));
  }

  // Secrets narrative (GM only) — strip HTML tags but keep the text content;
  // do NOT call stripSecrets() here because that removes the secret blocks entirely.
  if (isGM && dossier.overview.secretsNarrative.trim()) {
    const stripped = dossier.overview.secretsNarrative.replace(/<[^>]+>/g, "").trim();
    if (stripped) parts.push(line("GM Secrets / Hidden Info", stripped));
  }

  // Roleplay
  const rp = dossier.roleplay;
  const rpParts = nonEmpty([
    line("First Impression", rp.firstImpression),
    line("Personality", rp.personality),
    line("Motivation", rp.motivation),
    line("Fear", rp.fear),
    line("Mannerisms", rp.mannerisms),
    line("Voice/Speech", rp.voiceOrSpeech),
    line("Conversational Approach", rp.conversationalApproach),
    line("At the Table", rp.atTheTable),
  ]);
  if (rpParts.length) {
    parts.push("== Roleplay ==");
    parts.push(...rpParts);
  }
  const goals = rp.goals.filter(g => g.goal.trim()).slice(0, 5);
  if (goals.length) {
    parts.push("Goals:");
    parts.push(...goals.map((g, i) => `  ${i + 1}. ${g.goal.trim()}` + (g.questReference.trim() ? ` [Quest: ${g.questReference.trim()}]` : "")));
  }

  // Conditional information (non-secret rows only, max 8)
  const visibleCond = dossier.conditionalInfo
    .filter(c => isGM || c.visibility !== "secret")
    .slice(0, 8);
  if (visibleCond.length) {
    parts.push("== Conditional Information ==");
    for (const c of visibleCond) {
      const condParts = nonEmpty([
        `Trigger: ${c.trigger.trim()}`,
        `Response: ${c.response.trim()}`,
        c.consequence.trim() ? `Consequence: ${c.consequence.trim()}` : "",
      ]);
      if (condParts.length) parts.push(condParts.join(" | "));
    }
  }

  // Q&A (non-secret rows, max 10)
  const visibleQa = dossier.qa
    .filter(q => isGM || q.visibility !== "secret")
    .slice(0, 10);
  if (visibleQa.length) {
    parts.push("== Q&A ==");
    for (const q of visibleQa) {
      if (q.question.trim() && q.answer.trim()) {
        parts.push(`Q: ${q.question.trim()} | A: ${q.answer.trim()}`);
      }
    }
  }

  // Knowledge (max 10)
  const visibleKnowledge = dossier.knowledge.filter(k => k.statement.trim()).slice(0, 10);
  if (visibleKnowledge.length) {
    parts.push("== Knowledge ==");
    for (const k of visibleKnowledge) {
      const qualityLabel = k.quality === "knows" ? "Knows" :
        k.quality === "believes" ? "Believes" :
        k.quality === "rumor" ? "Rumor" : "Mistaken Belief";
      const cat = k.topicOrCategory.trim() ? ` [${k.topicOrCategory.trim()}]` : "";
      parts.push(`- ${qualityLabel}${cat}: ${k.statement.trim()}`);
    }
  }

  return parts.join("\n");
}
