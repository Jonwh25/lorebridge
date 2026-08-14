import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";

export type SessionLogPage = {
  sessionNumber: number;
  date?: string;
  content: string;
  pageId: string;
  pageName: string;
};

const SESSION_NUMBER_RE = /\bsession\s+#?(\d+)\b/i;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\w+ \d{1,2},?\s+\d{4})\b/;
const CONTENT_MAX = 40_000;

// ---------------------------------------------------------------------------
// Per-page extraction cache (cleared on Foundry world reload)
// ---------------------------------------------------------------------------

const _extractCache = new Map<string, string>();

function cacheKey(pageId: string, prompt: string): string {
  return `${pageId}|${prompt.slice(0, 200)}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function plainText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    return (
      new DOMParser().parseFromString(html, "text/html").body.textContent
        ?.replace(/\s+/g, " ")
        .trim() ?? ""
    );
  }
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function parseSessionNumber(name: string): number | null {
  const m = SESSION_NUMBER_RE.exec(name);
  if (!m) return null;
  const n = parseInt(m[1] ?? "", 10);
  return Number.isFinite(n) ? n : null;
}

function parseDate(text: string): string | undefined {
  const m = DATE_RE.exec(text);
  return m ? m[1] : undefined;
}

function getJournal(): FoundryJournalEntry {
  if (!game.journal) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry journal collection is unavailable.",
      { retryable: true },
    );
  }
  const folderName = (() => {
    try { return getLoreBridgeSettings().sessionLogFolder || "Session Logs"; }
    catch { return "Session Logs"; }
  })();
  for (const j of game.journal) {
    if (j.name.trim().toLocaleLowerCase() === folderName.toLocaleLowerCase()) return j;
  }
  throw new LoreBridgeCapabilityError(
    "NOT_FOUND",
    `No journal named "${folderName}" was found. Set the Session Log Journal name in LoreBridge world settings.`,
  );
}

type RawPage = { id: string; name: string; type: string; sort?: number; text?: { content?: string } };

function buildPage(page: RawPage, fallbackSessionNumber?: number): SessionLogPage | null {
  if (page.type !== "text") return null;
  const sessionNumber = parseSessionNumber(page.name) ?? fallbackSessionNumber ?? null;
  if (sessionNumber === null) return null;
  const content = plainText(page.text?.content ?? "").slice(0, CONTENT_MAX);
  const date = parseDate(content);
  return {
    sessionNumber,
    ...(date !== undefined ? { date } : {}),
    content,
    pageId: page.id,
    pageName: page.name,
  };
}

function sortedRawPages(journal: FoundryJournalEntry): RawPage[] {
  return Array.from(journal.pages)
    .map((p) => p as unknown as RawPage)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

function allPages(journal: FoundryJournalEntry): SessionLogPage[] {
  const raw = sortedRawPages(journal);
  const pages: SessionLogPage[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = buildPage(raw[i]!, i + 1);
    if (p) pages.push(p);
  }
  return pages.sort((a, b) => a.sessionNumber - b.sessionNumber);
}

// ---------------------------------------------------------------------------
// Public Read API
// ---------------------------------------------------------------------------

export function readAll(): SessionLogPage[] {
  requireFoundryGm("readAll");
  return allPages(getJournal());
}

export function readLatest(): SessionLogPage | null {
  requireFoundryGm("readLatest");
  const journal = getJournal();
  const raw = sortedRawPages(journal);
  const total = raw.length;
  // Walk from the last page backward and return the first text page found.
  // Using Foundry's sort order (same order as the journal UI) ensures we
  // always get the most recently added page, regardless of naming convention.
  for (let i = total - 1; i >= 0; i--) {
    const p = buildPage(raw[i]!, i + 1);
    if (p) return p;
  }
  return null;
}

export function readSince(sessionNumber: number): SessionLogPage[] {
  requireFoundryGm("readSince");
  return allPages(getJournal()).filter(p => p.sessionNumber > sessionNumber);
}

export function readPage(sessionNumber: number): SessionLogPage | null {
  requireFoundryGm("readPage");
  return allPages(getJournal()).find(p => p.sessionNumber === sessionNumber) ?? null;
}

// ---------------------------------------------------------------------------
// AI Extraction
// ---------------------------------------------------------------------------

export async function extractFromSession(
  content: string,
  prompt: string,
  pageId: string,
): Promise<string> {
  requireFoundryGm("extractFromSession");

  const key = cacheKey(pageId, prompt);
  const cached = _extractCache.get(key);
  if (cached !== undefined) return cached;

  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl) {
    throw new LoreBridgeCapabilityError(
      "CAPABILITY_UNAVAILABLE",
      "LoreBridge backend URL is not configured.",
    );
  }
  if (!settings.clientToken) {
    throw new LoreBridgeCapabilityError(
      "NOT_AUTHORIZED",
      "This browser is not paired with the LoreBridge backend.",
    );
  }

  const truncated = content.length > CONTENT_MAX ? content.slice(0, CONTENT_MAX) + "\n[... content truncated ...]" : content;

  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
  const url = `${base}v1/generate/extract`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.clientToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ content: truncated, prompt }),
    });
  } catch {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "Could not reach the LoreBridge backend.",
      { retryable: true },
    );
  }

  if (response.status === 503) {
    throw new LoreBridgeCapabilityError(
      "CAPABILITY_UNAVAILABLE",
      "The LoreBridge backend has no AI provider configured.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const message = body.error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }

  const raw = await response.json() as { result?: string };
  const result = typeof raw.result === "string" ? raw.result.trim() : "";
  if (!result) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "The backend returned an empty extraction result.");
  }

  _extractCache.set(key, result);
  return result;
}
