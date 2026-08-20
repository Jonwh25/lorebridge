import {
  validateSearchRollTablesInput,
  validateSearchRollTablesOutput,
  type RollTableSearchMatch,
  type SearchRollTablesInput,
  type SearchRollTablesOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";
import { collectWorldCandidateUuids } from "./search-candidates.js";
import { plainText } from "../utils/html.js";

const DEFAULT_LIMIT = 10;
const EXCERPT_LENGTH = 240;
const DESCRIPTION_LENGTH = 4_000;

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

function tableDescription(table: FoundryRollTable): string {
  if (typeof table.description === "string") {
    return plainText(table.description).slice(0, DESCRIPTION_LENGTH);
  }
  return "";
}

function excerptAround(text: string, query: string): string {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - Math.floor(EXCERPT_LENGTH / 3));
  const value = text.slice(start, start + EXCERPT_LENGTH).trim();
  return `${start > 0 ? "…" : ""}${value}${start + EXCERPT_LENGTH < text.length ? "…" : ""}`;
}

export function searchRollTables(input: SearchRollTablesInput): SearchRollTablesOutput {
  requireFoundryGm("searchRollTables");
  const validated = validateSearchRollTablesInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Roll table search input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }
  if (!game.tables) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry roll table collection is unavailable.",
      { retryable: true },
    );
  }

  const query = validated.value.query.trim();
  const needle = query.toLocaleLowerCase();
  const playerMode = validated.value.mode === "player";
  const filterFolderId = validated.value.folderId;
  const candidateUuids = collectWorldCandidateUuids(query, "RollTable", game.tables);
  const matches: Array<{ score: number; candidate: number; value: RollTableSearchMatch }> = [];
  let hiddenCount = 0;

  for (const table of game.tables) {
    if (playerMode && !isPlayerVisible(table.ownership)) { hiddenCount++; continue; }
    if (filterFolderId !== undefined && table.folder?.id !== filterFolderId) continue;
    const name = table.name.toLocaleLowerCase();
    const description = tableDescription(table);
    let match: { score: number; value: RollTableSearchMatch } | undefined;
    if (name.includes(needle)) {
      match = {
        score: name === needle ? 0 : 1,
        value: {
          tableId: table.id,
          tableUuid: table.uuid,
          tableName: table.name,
          matchedField: "tableName",
        },
      };
    } else if (description.toLocaleLowerCase().includes(needle)) {
      match = {
        score: 2,
        value: {
          tableId: table.id,
          tableUuid: table.uuid,
          tableName: table.name,
          matchedField: "description",
          description: excerptAround(description, query),
        },
      };
    }
    if (match) {
      if (table.img) match.value.img = table.img;
      if (table.folder?.id) match.value.folderId = table.folder.id;
      if (table.folder?.name) match.value.folderName = table.folder.name;
      matches.push({ ...match, candidate: candidateUuids.has(table.uuid) ? 0 : 1 });
    }
  }

  const output: SearchRollTablesOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    query,
    results: matches
      .sort(
        (a, b) =>
          a.score - b.score
          || a.candidate - b.candidate
          || a.value.tableName.localeCompare(b.value.tableName)
          || a.value.tableId.localeCompare(b.value.tableId),
      )
      .slice(0, validated.value.limit ?? DEFAULT_LIMIT)
      .map(({ value }) => value),
    hiddenCount,
  };
  const outputValidation = validateSearchRollTablesOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid roll table search results.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}
