import type {
  GetJournalOutput,
  GetJournalPageOutput,
  SearchJournalsInput,
  SearchJournalsOutput,
} from "@lorebridge/shared/capabilities";

export interface JournalService {
  search(input: SearchJournalsInput): Promise<SearchJournalsOutput>;
  get(journalId: string): Promise<GetJournalOutput | undefined>;
  getPage(journalId: string, pageId: string): Promise<GetJournalPageOutput | undefined>;
}

export interface BackendServices {
  journals?: JournalService;
}
