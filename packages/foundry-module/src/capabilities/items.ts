import {
  validateSearchItemsInput,
  validateSearchItemsOutput,
  validateGetActorInventoryInput,
  validateGetActorInventoryOutput,
  validateGetItemInput,
  validateGetItemOutput,
  type GetActorInventoryInput,
  type GetActorInventoryOutput,
  type GetItemInput,
  type GetItemOutput,
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

function numField(obj: unknown, key: string): number | undefined {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function itemActivation(item: FoundryItem): GetItemOutput["activation"] {
  const act = item.system.activation;
  if (!act || typeof act !== "object" || Array.isArray(act)) return undefined;
  const rec = act as Record<string, unknown>;
  const type = typeof rec.type === "string" && rec.type ? rec.type : undefined;
  const cost = numField(rec, "cost");
  const condition = typeof rec.condition === "string" && rec.condition.trim() ? rec.condition.trim() : undefined;
  if (!type && cost === undefined && !condition) return undefined;
  return { ...(type ? { type } : {}), ...(cost !== undefined ? { cost } : {}), ...(condition ? { condition } : {}) };
}

function itemTarget(item: FoundryItem): GetItemOutput["target"] {
  const tgt = item.system.target;
  if (!tgt || typeof tgt !== "object" || Array.isArray(tgt)) return undefined;
  const rec = tgt as Record<string, unknown>;
  const value = numField(rec, "value");
  const units = typeof rec.units === "string" && rec.units ? rec.units : undefined;
  const type = typeof rec.type === "string" && rec.type ? rec.type : undefined;
  if (value === undefined && !units && !type) return undefined;
  return { ...(value !== undefined ? { value } : {}), ...(units ? { units } : {}), ...(type ? { type } : {}) };
}

function itemRange(item: FoundryItem): GetItemOutput["range"] {
  const rng = item.system.range;
  if (!rng || typeof rng !== "object" || Array.isArray(rng)) return undefined;
  const rec = rng as Record<string, unknown>;
  const value = numField(rec, "value");
  const long = numField(rec, "long");
  const units = typeof rec.units === "string" && rec.units ? rec.units : undefined;
  if (value === undefined && long === undefined && !units) return undefined;
  return { ...(value !== undefined ? { value } : {}), ...(long !== undefined && long > 0 ? { long } : {}), ...(units ? { units } : {}) };
}

function itemDuration(item: FoundryItem): GetItemOutput["duration"] {
  const dur = item.system.duration;
  if (!dur || typeof dur !== "object" || Array.isArray(dur)) return undefined;
  const rec = dur as Record<string, unknown>;
  const value = numField(rec, "value");
  const units = typeof rec.units === "string" && rec.units ? rec.units : undefined;
  if (value === undefined && !units) return undefined;
  return { ...(value !== undefined ? { value } : {}), ...(units ? { units } : {}) };
}

function itemUses(item: FoundryItem): GetItemOutput["uses"] {
  const uses = item.system.uses;
  if (!uses || typeof uses !== "object" || Array.isArray(uses)) return undefined;
  const rec = uses as Record<string, unknown>;
  const value = numField(rec, "value");
  const max = numField(rec, "max");
  const per = typeof rec.per === "string" && rec.per ? rec.per : typeof rec.recovery === "string" && rec.recovery ? rec.recovery : undefined;
  if (value === undefined && max === undefined && !per) return undefined;
  return { ...(value !== undefined ? { value } : {}), ...(max !== undefined ? { max } : {}), ...(per ? { per } : {}) };
}

function itemDamageFormulas(item: FoundryItem): string[] | undefined {
  const dmg = item.system.damage;
  if (!dmg || typeof dmg !== "object" || Array.isArray(dmg)) return undefined;
  const rec = dmg as Record<string, unknown>;
  const parts = rec.parts;
  if (!Array.isArray(parts) || parts.length === 0) return undefined;
  const formulas: string[] = [];
  for (const part of parts) {
    if (Array.isArray(part) && typeof part[0] === "string" && part[0].trim()) {
      const formula = part[1] ? `${part[0].trim()} (${part[1]})` : part[0].trim();
      formulas.push(formula);
    } else if (typeof part === "object" && part !== null) {
      const p = part as Record<string, unknown>;
      if (typeof p.formula === "string" && p.formula.trim()) {
        const formula = p.type ? `${p.formula.trim()} (${p.type})` : p.formula.trim();
        formulas.push(formula);
      }
    }
  }
  const versatile = typeof rec.versatile === "string" && rec.versatile.trim() ? rec.versatile.trim() : undefined;
  if (versatile) formulas.push(`${versatile} (versatile)`);
  return formulas.length > 0 ? formulas : undefined;
}

function itemSave(item: FoundryItem): GetItemOutput["save"] {
  const save = item.system.save;
  if (!save || typeof save !== "object" || Array.isArray(save)) return undefined;
  const rec = save as Record<string, unknown>;
  const ability = typeof rec.ability === "string" && rec.ability ? rec.ability : undefined;
  const dc = numField(rec, "dc") ?? numField(rec, "flat");
  if (!ability && dc === undefined) return undefined;
  return { ...(ability ? { ability } : {}), ...(dc !== undefined ? { dc } : {}) };
}

function itemProperties(item: FoundryItem): string[] | undefined {
  const props = item.system.properties;
  if (props instanceof Set) {
    const arr = Array.from(props as Set<unknown>).filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    return arr.length > 0 ? arr : undefined;
  }
  if (typeof props === "object" && props !== null && !Array.isArray(props)) {
    const rec = props as Record<string, unknown>;
    const arr = Object.entries(rec).filter(([, v]) => v === true).map(([k]) => k);
    return arr.length > 0 ? arr : undefined;
  }
  if (Array.isArray(props)) {
    const arr = props.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    return arr.length > 0 ? arr : undefined;
  }
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
  const excludeFolderIdSet = validated.value.excludeFolderIds && validated.value.excludeFolderIds.length > 0 ? new Set(validated.value.excludeFolderIds) : undefined;
  const candidateUuids = collectWorldCandidateUuids(query, "Item", game.items);
  const matches: Array<{ score: number; candidate: number; value: ItemSearchMatch }> = [];
  let hiddenCount = 0;

  for (const item of game.items) {
    if (playerMode && !isPlayerVisible(item.ownership)) { hiddenCount++; continue; }
    if (types && !types.includes(item.type.toLocaleLowerCase())) continue;
    if (filterFolderId !== undefined && item.folder?.id !== filterFolderId) continue;
    if (excludeFolderIdSet !== undefined && excludeFolderIdSet.has(item.folder?.id ?? "")) continue;
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

export function getItem(input: GetItemInput): GetItemOutput {
  requireFoundryGm("getItem");
  const validated = validateGetItemInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      "Item retrieval input is invalid.",
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

  const rawId = validated.value.itemId;
  const itemId = rawId.startsWith("Item.") ? rawId.split(".")[1] ?? "" : rawId;
  const item = game.items.get(itemId);
  if (!item) throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested item was not found.");
  if (validated.value.mode === "player" && !isPlayerVisible(item.ownership)) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested item was not found.");
  }
  // Unidentified items: in player mode, hide if not identified
  if (validated.value.mode === "player") {
    const identified = itemIdentified(item);
    if (identified === false) throw new LoreBridgeCapabilityError("NOT_FOUND", "The requested item is not identified.");
  }

  const output: GetItemOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    systemId: game.system.id,
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    type: item.type,
  };
  if (item.img) output.img = item.img;
  if (item.folder) output.folder = { id: item.folder.id, name: item.folder.name };
  const desc = itemDescription(item);
  if (desc) output.description = desc;
  const qty = itemQuantity(item);
  if (qty !== undefined) output.quantity = qty;
  const wt = itemWeight(item);
  if (wt !== undefined) output.weight = wt;
  const price = itemPrice(item);
  if (price !== undefined) output.price = price;
  const rarity = itemRarity(item);
  if (rarity !== undefined) output.rarity = rarity;
  const identified = itemIdentified(item);
  if (identified !== undefined) output.identified = identified;
  const activation = itemActivation(item);
  if (activation) output.activation = activation;
  const target = itemTarget(item);
  if (target) output.target = target;
  const range = itemRange(item);
  if (range) output.range = range;
  const duration = itemDuration(item);
  if (duration) output.duration = duration;
  const uses = itemUses(item);
  if (uses) output.uses = uses;
  const damageFormulas = itemDamageFormulas(item);
  if (damageFormulas) output.damageFormulas = damageFormulas;
  const save = itemSave(item);
  if (save) output.save = save;
  const properties = itemProperties(item);
  if (properties) output.properties = properties;

  const outputValidation = validateGetItemOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "Foundry returned an invalid item.",
      { details: { validationErrors: outputValidation.errors } },
    );
  }
  return outputValidation.value;
}
