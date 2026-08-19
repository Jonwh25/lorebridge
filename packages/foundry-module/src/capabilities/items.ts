import {
  validateSearchItemsInput,
  validateSearchItemsOutput,
  validateGetActorInventoryInput,
  validateGetActorInventoryOutput,
  type GetActorInventoryInput,
  type GetActorInventoryOutput,
  type InventoryItem,
  type ItemSearchMatch,
  type SearchItemsInput,
  type SearchItemsOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";
import { collectWorldCandidateUuids } from "./search-candidates.js";
import { plainText } from "../utils/html.js";

const DEFAULT_LIMIT = 10;
const EXCERPT_LENGTH = 240;
const DESCRIPTION_LENGTH = 4_000;
const INVENTORY_LIMIT = 200;

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

function itemDescription(item: FoundryItem): string {
  const sys = item.system;
  const descField = sys.description;
  if (typeof descField === "string") return plainText(descField).slice(0, DESCRIPTION_LENGTH);
  if (
    typeof descField === "object"
    && descField !== null
    && !Array.isArray(descField)
  ) {
    const rec = descField as Record<string, unknown>;
    for (const key of ["value", "public", "content"]) {
      if (typeof rec[key] === "string") {
        return plainText(rec[key] as string).slice(0, DESCRIPTION_LENGTH);
      }
    }
  }
  return "";
}

function itemQuantity(item: FoundryItem): number | undefined {
  const qty = item.system.quantity;
  if (typeof qty === "number" && Number.isFinite(qty)) return qty;
  return undefined;
}

function itemWeight(item: FoundryItem): number | undefined {
  const w = item.system.weight;
  if (typeof w === "number" && Number.isFinite(w)) return w;
  if (typeof w === "object" && w !== null && !Array.isArray(w)) {
    const v = (w as Record<string, unknown>).value;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function itemPrice(item: FoundryItem): string | undefined {
  const p = item.system.price;
  if (typeof p === "string" && p.trim()) return p.trim();
  if (typeof p === "number" && Number.isFinite(p)) return String(p);
  if (typeof p === "object" && p !== null && !Array.isArray(p)) {
    const rec = p as Record<string, unknown>;
    const value = rec.value;
    const denomination = rec.denomination ?? rec.currency ?? "";
    if (typeof value === "number" && Number.isFinite(value)) {
      return denomination ? `${value} ${denomination}` : String(value);
    }
  }
  return undefined;
}

function itemRarity(item: FoundryItem): string | undefined {
  const r = item.system.rarity;
  if (typeof r === "string" && r.trim()) return r.trim();
  return undefined;
}

function itemIdentified(item: FoundryItem): boolean | undefined {
  const identified = item.system.identified;
  if (typeof identified === "boolean") return identified;
  return undefined;
}

function toInventoryItem(item: FoundryItem): InventoryItem {
  const entry: InventoryItem = {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    type: item.type,
  };
  if (item.img) entry.img = item.img;
  const qty = itemQuantity(item);
  if (qty !== undefined) entry.quantity = qty;
  const wt = itemWeight(item);
  if (wt !== undefined) entry.weight = wt;
  const price = itemPrice(item);
  if (price !== undefined) entry.price = price;
  const rarity = itemRarity(item);
  if (rarity !== undefined) entry.rarity = rarity;
  const identified = itemIdentified(item);
  if (identified !== undefined) entry.identified = identified;
  const desc = itemDescription(item);
  if (desc) entry.description = desc;
  return entry;
}

export function searchItems(input: SearchItemsInput): SearchItemsOutput {
  requireFoundryGm("searchItems");
  const validated = validateSearchItemsInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Item search input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }
  if (!game.items) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry item collection is unavailable.",
      { retryable: true },
    );
  }

  const query = validated.value.query.trim();
  const needle = query.toLocaleLowerCase();
  const types = validated.value.types?.map((t) => t.toLocaleLowerCase());
  const playerMode = validated.value.mode === "player";
  const filterFolderId = validated.value.folderId;
  const candidateUuids = collectWorldCandidateUuids(query, "Item", game.items);
  const matches: Array<{ score: number; candidate: number; value: ItemSearchMatch }> = [];
  let hiddenCount = 0;

  for (const item of game.items) {
    if (playerMode && !isPlayerVisible(item.ownership)) { hiddenCount++; continue; }
    if (types && !types.includes(item.type.toLocaleLowerCase())) continue;
    if (filterFolderId !== undefined && item.folder?.id !== filterFolderId) continue;
    const name = item.name.toLocaleLowerCase();
    const description = itemDescription(item);
    let match: { score: number; value: ItemSearchMatch } | undefined;
    if (name.includes(needle)) {
      match = {
        score: name === needle ? 0 : 1,
        value: {
          itemId: item.id,
          itemUuid: item.uuid,
          itemName: item.name,
          itemType: item.type,
          matchedField: "itemName",
        },
      };
    } else if (description.toLocaleLowerCase().includes(needle)) {
      match = {
        score: 2,
        value: {
          itemId: item.id,
          itemUuid: item.uuid,
          itemName: item.name,
          itemType: item.type,
          matchedField: "description",
          excerpt: excerptAround(description, query),
        },
      };
    }
    if (match) {
      if (item.img) match.value.img = item.img;
      if (item.folder?.id) match.value.folderId = item.folder.id;
      if (item.folder?.name) match.value.folderName = item.folder.name;
      matches.push({ ...match, candidate: candidateUuids.has(item.uuid) ? 0 : 1 });
    }
  }

  const output: SearchItemsOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    query,
    results: matches
      .sort(
        (a, b) =>
          a.score - b.score
          || a.candidate - b.candidate
          || a.value.itemName.localeCompare(b.value.itemName)
          || a.value.itemId.localeCompare(b.value.itemId),
      )
      .slice(0, validated.value.limit ?? DEFAULT_LIMIT)
      .map(({ value }) => value),
    hiddenCount,
  };
  const outputValidation = validateSearchItemsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned invalid item search results.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}

export function getActorInventory(input: GetActorInventoryInput): GetActorInventoryOutput {
  requireFoundryGm("getActorInventory");
  const validated = validateGetActorInventoryInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Actor inventory input is invalid.",
      { details: { validationErrors: validated.errors } },
    );
  }
  if (!game.actors) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry actor collection is unavailable.",
      { retryable: true },
    );
  }

  const actorId = validated.value.actorId.startsWith("Actor.")
    ? validated.value.actorId.split(".")[1] ?? ""
    : validated.value.actorId;
  const actor = game.actors.get(actorId);
  if (!actor) throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested actor was not found.");
  if (validated.value.mode === "player" && !isPlayerVisible(actor.ownership)) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested actor was not found.");
  }

  const items: InventoryItem[] = [];
  let count = 0;
  for (const item of actor.items) {
    if (count >= INVENTORY_LIMIT) break;
    items.push(toInventoryItem(item));
    count++;
  }

  const output: GetActorInventoryOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    actorId: actor.id,
    actorUuid: actor.uuid,
    actorName: actor.name,
    items,
  };
  const outputValidation = validateGetActorInventoryOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned an invalid actor inventory.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}
