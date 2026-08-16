import {
  validateSearchSessionLogsInput,
  validateSearchSessionLogsOutput,
  validateGetSessionLogInput,
  validateGetSessionLogOutput,
  type GetSessionLogInput,
  type GetSessionLogOutput,
  type SearchSessionLogsInput,
  type SearchSessionLogsOutput,
  type SessionLogMatch,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";
import { plainText } from "../utils/html.js";
import { SESSION_NUMBER_RE } from "./session-log-pipeline.js";

const DEFAULT_LIMIT = 20;
const EXCERPT_LENGTH = 300;
const CONTENT_LENGTH = 40_000;

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

function excerptAround(text: string, query: string): string {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - Math.floor(EXCERPT_LENGTH / 3));
  const value = text.slice(start, start + EXCERPT_LENGTH).trim();
  return `${start > 0 ? "…" : ""}${value}${start + EXCERPT_LENGTH < text.length ? "…" : ""}`;
}

function extractSessionNumber(name: string): number | undefined {
  const match = SESSION_NUMBER_RE.exec(name);
  if (!match) return undefined;
  const num = parseInt(match[1] ?? "", 10);
  return Number.isFinite(num) ? num : undefined;
}

function sessionLogJournalName(): string {
  try {
    return getLoreBridgeSettings().sessionLogFolder || "Session Logs";
  } catch {
    return "Session Logs";
  }
}

function getSessionLogJournal(): { journal: FoundryJournalEntry; journalName: string } {
  if (!game.journal) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry journal collection is unavailable.",
      { retryable: true },
    );
  }
  const journalName = sessionLogJournalName();
  const nameLower = journalName.trim().toLocaleLowerCase();
  // If multiple journals share the same name, prefer the one with the most pages.
  let best: FoundryJournalEntry | undefined;
  let bestSize = -1;
  for (const journal of game.journal) {
    if (journal.name.trim().toLocaleLowerCase() === nameLower) {
      const size = (journal.pages as unknown as { size?: number }).size ?? 0;
      if (size > bestSize) { bestSize = size; best = journal; }
    }
  }
  if (best) return { journal: best, journalName: best.name };
  throw new LoreBridgeCapabilityError(
    "NOT_FOUND",
    `No journal named "${journalName}" was found. Set the Session Log Journal name in LoreBridge world settings.`,
  );
}

export function searchSessionLogs(input: SearchSessionLogsInput): SearchSessionLogsOutput {
  requireFoundryGm("searchSessionLogs");
  const validated = validateSearchSessionLogsInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Session log search input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }

  const { journal, journalName } = getSessionLogJournal();
  const query = validated.value.query.trim();
  const needle = query.toLocaleLowerCase();
  const limit = validated.value.limit ?? DEFAULT_LIMIT;
  const matches: Array<{ score: number; sessionNumber: number | undefined; value: SessionLogMatch }> = [];

  for (const page of journal.pages) {
      if (page.type !== "text") continue;
      const pageName = page.name;
      const sessionNumber = extractSessionNumber(pageName);
      const pageNameLower = pageName.toLocaleLowerCase();
      const content = plainText(page.text?.content ?? "");

      let match: { score: number; sessionNumber: number | undefined; value: SessionLogMatch } | undefined;

      if (pageNameLower.includes(needle)) {
        match = {
          score: pageNameLower === needle ? 0 : 1,
          sessionNumber,
          value: {
            journalId: journal.id,
            journalUuid: journal.uuid,
            journalName,
            pageId: page.id,
            pageUuid: page.uuid,
            pageName,
            matchedField: "pageName",
          },
        };
      } else if (content.toLocaleLowerCase().includes(needle)) {
        match = {
          score: 2,
          sessionNumber,
          value: {
            journalId: journal.id,
            journalUuid: journal.uuid,
            journalName,
            pageId: page.id,
            pageUuid: page.uuid,
            pageName,
            matchedField: "content",
            excerpt: excerptAround(content, query),
          },
        };
      }

      if (match) {
        if (sessionNumber !== undefined) match.value.sessionNumber = sessionNumber;
        matches.push(match);
      }
  }

  const output: SearchSessionLogsOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    query,
    folderName: journalName,
    results: matches
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        // Sort by session number descending (most recent first) when available
        if (a.sessionNumber !== undefined && b.sessionNumber !== undefined) {
          return b.sessionNumber - a.sessionNumber;
        }
        return a.value.pageName.localeCompare(b.value.pageName);
      })
      .slice(0, limit)
      .map(({ value }) => value),
  };

  const outputValidation = validateSearchSessionLogsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid session log search results.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}

export function getSessionLog(input: GetSessionLogInput): GetSessionLogOutput {
  requireFoundryGm("getSessionLog");
  const validated = validateGetSessionLogInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Session log retrieval input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }
  if (!game.journal) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry journal collection is unavailable.",
      { retryable: true },
    );
  }

  const { journal, journalName } = getSessionLogJournal();

  const pageId = validated.value.pageId;
  const page = journal.pages.get(pageId);
  if (!page || page.type !== "text") {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested session log page was not found.");
  }

  const content = plainText(page.text?.content ?? "").slice(0, CONTENT_LENGTH);
  const sessionNumber = extractSessionNumber(page.name);

  const output: GetSessionLogOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    journalId: journal.id,
    journalUuid: journal.uuid,
    journalName,
    pageId: page.id,
    pageUuid: page.uuid,
    pageName: page.name,
    plainText: content,
    ...(sessionNumber !== undefined ? { sessionNumber } : {}),
  };

  const outputValidation = validateGetSessionLogOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned an invalid session log page.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}
