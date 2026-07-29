import {
  validateGetJournalInput,
  validateGetJournalOutput,
  validateSearchJournalsInput,
  validateSearchJournalsOutput,
  type GetJournalOutput,
  type JournalPage,
  type JournalSearchMatch,
  type SearchJournalsInput,
  type SearchJournalsOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";

const DEFAULT_LIMIT = 10;
const EXCERPT_LENGTH = 240;

function sourceId(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return `foundry:${game.world.id}`;
}

function plainText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(html, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function excerptAround(text: string, query: string): string {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - Math.floor(EXCERPT_LENGTH / 3));
  const value = text.slice(start, start + EXCERPT_LENGTH).trim();
  return `${start > 0 ? "…" : ""}${value}${start + EXCERPT_LENGTH < text.length ? "…" : ""}`;
}

function serializePage(page: FoundryJournalPage): JournalPage {
  const result: JournalPage = {
    id: page.id,
    uuid: page.uuid,
    name: page.name,
    type: page.type,
    sort: page.sort,
  };
  if (page.text?.content !== undefined) {
    result.text = {
      format: page.text.format ?? 1,
      html: page.text.content,
      plainText: plainText(page.text.content),
    };
  }
  if (page.src) result.src = page.src;
  return result;
}

export function searchJournals(input: SearchJournalsInput): SearchJournalsOutput {
  requireFoundryGm("searchJournals");
  const validated = validateSearchJournalsInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Journal search input is invalid.", { details: { validationErrors: validated.errors } });
  }
  if (!game.journal) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry journal collection is unavailable.", { retryable: true });

  const query = validated.value.query.trim();
  const needle = query.toLocaleLowerCase();
  const matches: Array<{ score: number; value: JournalSearchMatch }> = [];

  for (const journal of game.journal) {
    const pages = Array.from(journal.pages);
    let best: { score: number; value: JournalSearchMatch } | undefined;
    const journalName = journal.name.toLocaleLowerCase();
    if (journalName.includes(needle)) {
      best = {
        score: journalName === needle ? 0 : 1,
        value: { journalId: journal.id, journalUuid: journal.uuid, journalName: journal.name, pageCount: pages.length, matchedField: "journalName" },
      };
    }
    for (const page of pages) {
      const pageName = page.name.toLocaleLowerCase();
      if (pageName.includes(needle) && (!best || best.score > 2)) {
        best = {
          score: pageName === needle ? 2 : 3,
          value: { journalId: journal.id, journalUuid: journal.uuid, journalName: journal.name, pageCount: pages.length, matchedPageId: page.id, matchedPageName: page.name, matchedField: "pageName" },
        };
      }
      const text = page.text?.content ? plainText(page.text.content) : "";
      if (text.toLocaleLowerCase().includes(needle) && (!best || best.score > 4)) {
        best = {
          score: 4,
          value: { journalId: journal.id, journalUuid: journal.uuid, journalName: journal.name, pageCount: pages.length, matchedPageId: page.id, matchedPageName: page.name, matchedField: "pageText", excerpt: excerptAround(text, query) },
        };
      }
    }
    if (best) matches.push(best);
  }

  const output: SearchJournalsOutput = {
    sourceId: sourceId(),
    query,
    results: matches
      .sort((left, right) => left.score - right.score || left.value.journalName.localeCompare(right.value.journalName))
      .slice(0, validated.value.limit ?? DEFAULT_LIMIT)
      .map(({ value }) => value),
  };
  const outputValidation = validateSearchJournalsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned invalid journal search results.", { details: { validationErrors: outputValidation.errors } });
  return outputValidation.value;
}

export function getJournal(input: { journalId: string }): GetJournalOutput {
  requireFoundryGm("getJournal");
  const validated = validateGetJournalInput(input);
  if (!validated.valid || !validated.value) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Journal retrieval input is invalid.", { details: { validationErrors: validated.errors } });
  if (!game.journal) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry journal collection is unavailable.", { retryable: true });

  const nativeId = validated.value.journalId.startsWith("JournalEntry.")
    ? validated.value.journalId.split(".")[1] ?? ""
    : validated.value.journalId;
  const journal = game.journal.get(nativeId);
  if (!journal) throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested journal was not found.");

  const output: GetJournalOutput = {
    sourceId: sourceId(),
    id: journal.id,
    uuid: journal.uuid,
    name: journal.name,
    pages: Array.from(journal.pages).sort((a, b) => a.sort - b.sort).map(serializePage),
  };
  const outputValidation = validateGetJournalOutput(output);
  if (!outputValidation.valid || !outputValidation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned an invalid journal.", { details: { validationErrors: outputValidation.errors } });
  return outputValidation.value;
}
