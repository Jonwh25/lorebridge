const TITLE_PREFIXES = [
  "ghost of",
  "spirit of",
  "sir",
  "lady",
  "baron",
  "baroness",
  "father",
  "mother",
  "lord",
  "king",
  "queen",
  "the",
  "mad",
  "brother",
  "sister",
];

const HYPHEN_RE = /-/g;
const PUNCT_RE = /[^\w\s]/g;
const MULTI_SPACE_RE = /\s+/g;

function stripLeadingTitles(name: string): string {
  let remaining = name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const title of TITLE_PREFIXES) {
      if (remaining.startsWith(title + " ")) {
        remaining = remaining.slice(title.length + 1);
        changed = true;
      }
    }
  }
  return remaining.trim();
}

export function normalizeName(name: string): string {
  return stripLeadingTitles(
    name.toLowerCase().replace(HYPHEN_RE, " ").replace(PUNCT_RE, "").replace(MULTI_SPACE_RE, " ").trim(),
  );
}

function scoreMatch(candidate: string, target: string): number {
  const normCandidate = normalizeName(candidate);
  const normTarget = normalizeName(target);

  if (normCandidate === normTarget) return 100;
  if (normCandidate.startsWith(normTarget)) return 90;
  if (normTarget.startsWith(normCandidate)) return 85;
  if (normCandidate.includes(normTarget)) return 70;

  const targetWords = normTarget.split(" ").filter(Boolean);
  if (targetWords.length > 1 && targetWords.every(w => normCandidate.includes(w))) return 50;

  const firstWord = targetWords[0] ?? "";
  const lastWord = targetWords[targetWords.length - 1] ?? firstWord;
  if (
    firstWord !== lastWord &&
    normCandidate.includes(firstWord) &&
    normCandidate.includes(lastWord)
  ) return 40;

  return 0;
}

const DEFAULT_THRESHOLD = 50;

export function matchName(
  candidate: string,
  targets: string[],
  threshold = DEFAULT_THRESHOLD,
): string | null {
  let bestScore = -1;
  let bestTarget: string | null = null;

  for (const target of targets) {
    const score = scoreMatch(candidate, target);
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestTarget = target;
    }
  }

  return bestTarget;
}
