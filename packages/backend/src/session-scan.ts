/**
 * Regex-based entity extraction for POST /v1/session/scan.
 * Finds capitalized proper-noun candidates in session log text that are not
 * already present in the world's existing actor/journal/scene names.
 */

export type ScannedEntity = { name: string; context: string };

// Words that appear capitalized in normal English prose but are not proper nouns.
const COMMON_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "here", "there", "when",
  "where", "why", "how", "all", "both", "each", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "because", "as", "until", "while",
  "although", "since", "unless", "though",
  "i", "we", "you", "he", "she", "they", "it", "me", "us", "him", "her", "them",
  "my", "our", "your", "his", "its", "their",
  "this", "that", "these", "those", "which", "who", "whom", "whose", "what",
  "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "must", "shall", "can",
  "also", "well", "back", "still", "even", "now", "then", "already", "yet",
  "gm", "dm", "pc", "npc", "session", "note", "notes", "player", "players",
  "lorebridge", "lore", "bridge",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
]);

/**
 * Extract candidate proper-noun entities from session log plain text.
 * Returns entities not found in the provided list of existing world names.
 */
export function extractSessionEntities(
  text: string,
  existingNames: string[],
): ScannedEntity[] {
  const existingNormalized = new Set(
    existingNames
      .filter((n) => typeof n === "string")
      .map((n) => n.toLowerCase().trim()),
  );

  // Split into sentences so we can capture context.
  const sentences = text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const candidates = new Map<string, string>(); // normalised name → context

  // Match 1–4 consecutive Title-Case words (each word starts uppercase, rest lower/mixed).
  const PROPER_NOUN_RE = /\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){0,3})\b/g;

  for (const sentence of sentences) {
    let match: RegExpExecArray | null;
    PROPER_NOUN_RE.lastIndex = 0;

    while ((match = PROPER_NOUN_RE.exec(sentence)) !== null) {
      const raw = (match[1] ?? "").trim();
      if (!raw) continue;
      const words = raw.split(/\s+/);

      // Skip if any word is a common English word.
      if (words.some((w) => COMMON_WORDS.has(w.toLowerCase()))) continue;

      // Single-word candidates must be at least 4 characters.
      if (words.length === 1 && raw.length < 4) continue;

      const key = raw.toLowerCase();
      if (existingNormalized.has(key)) continue;
      if (candidates.has(key)) continue; // already captured

      const context = sentence.length > 130 ? sentence.slice(0, 130) + "…" : sentence;
      candidates.set(key, context);
    }
  }

  // Return with original casing from first occurrence.
  const result: ScannedEntity[] = [];
  const seen = new Map<string, string>(); // key → original name

  for (const sentence of sentences) {
    PROPER_NOUN_RE.lastIndex = 0;
    let match2: RegExpExecArray | null;
    while ((match2 = PROPER_NOUN_RE.exec(sentence)) !== null) {
      const raw = (match2[1] ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (candidates.has(key) && !seen.has(key)) {
        seen.set(key, raw);
        result.push({ name: raw, context: candidates.get(key)! });
      }
    }
  }

  return result;
}
