import {
  validateExportForEmbeddingInput,
  type EmbeddingDocumentType,
  type EmbeddingItem,
  type ExportForEmbeddingInput,
  type ExportForEmbeddingOutput,
} from "@lorebridge/shared/capabilities";
import { plainText } from "../utils/html.js";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";

const MAX_TEXT_CHARS = 4_000;
const SNIPPET_CHARS = 200;

function nestedValue(obj: unknown, keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function textValue(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v !== "object" || v === null) return undefined;
  const record = v as Record<string, unknown>;
  for (const key of ["value", "public", "content"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return undefined;
}

function extractActorText(actor: Record<string, unknown>): string {
  const paths = [
    ["details", "biography"],
    ["biography"],
    ["description"],
    ["details", "description"],
  ];
  for (const path of paths) {
    const raw = textValue(nestedValue(actor.system, path));
    if (raw) return plainText(raw).slice(0, MAX_TEXT_CHARS);
  }
  return "";
}

export function exportForEmbedding(input: ExportForEmbeddingInput): ExportForEmbeddingOutput {
  requireFoundryGm("exportForEmbedding");
  const validated = validateExportForEmbeddingInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Export-for-embedding input is invalid.", {
      details: { validationErrors: validated.errors },
    });
  }

  const types: EmbeddingDocumentType[] = validated.value.types ?? ["journal", "actor"];
  const items: EmbeddingItem[] = [];

  if (types.includes("journal") && game.journal) {
    for (const journal of game.journal) {
      if (!journal.pages) continue;
      for (const page of journal.pages) {
        const html: string = (page.text as { content?: string } | undefined)?.content ?? "";
        const text = plainText(html).trim();
        if (!text) continue;
        items.push({
          uuid: page.uuid as string,
          documentType: "journal",
          name: `${journal.name ?? "Untitled"} / ${(page.name as string | undefined) ?? "Untitled"}`,
          text: text.slice(0, MAX_TEXT_CHARS),
        });
      }
    }
  }

  if (types.includes("actor") && game.actors) {
    for (const actor of game.actors) {
      const text = extractActorText(actor as unknown as Record<string, unknown>);
      items.push({
        uuid: actor.uuid as string,
        documentType: "actor",
        name: (actor.name as string | undefined) ?? "Untitled",
        text: text.slice(0, MAX_TEXT_CHARS),
      });
    }
  }

  const sourceId = game.world ? `foundry:${game.world.id}` : "foundry:unknown";
  const sourceName = game.world?.title ?? "Unknown Foundry World";

  // Trim text to snippet length after collecting — stored text was full-length for embedding quality.
  // The backend stores the full text; excerpt is derived there. Return full text.
  void SNIPPET_CHARS; // used by the backend index service

  return { sourceId, sourceName, items };
}
