import type {
  GetJournalOutput,
  SearchJournalsInput,
  SearchJournalsOutput,
} from "@lorebridge/shared/capabilities";

export interface JournalService {
  search(input: SearchJournalsInput): Promise<SearchJournalsOutput>;
  get(journalId: string): Promise<GetJournalOutput | undefined>;
}

export interface BackendServices {
  journals?: JournalService;
}
