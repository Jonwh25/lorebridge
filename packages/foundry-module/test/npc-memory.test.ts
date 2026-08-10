import assert from "node:assert/strict";
import test from "node:test";

import { type NpcMemoryEntry, getMemories, deleteMemory, clearMemories } from "../src/capabilities/npc-mention.js";

// ---------------------------------------------------------------------------
// Minimal actor stub that mirrors the lorebridge flag behaviour
// ---------------------------------------------------------------------------

function makeActor(initial: NpcMemoryEntry[] = []): {
  flags: Record<string, NpcMemoryEntry[]>;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  id: string;
  uuid: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  ownership: Record<string, number>;
  items: { size: number };
  update(): Promise<unknown>;
  createEmbeddedDocuments(): Promise<unknown[]>;
} {
  const flags: Record<string, NpcMemoryEntry[]> = { memories: [...initial] };
  return {
    flags,
    id: "actor-1",
    uuid: "Actor.actor-1",
    name: "Mira",
    type: "npc",
    system: {},
    ownership: {},
    items: { size: 0 },
    update() { return Promise.resolve(this); },
    createEmbeddedDocuments() { return Promise.resolve([]); },
    getFlag(_scope: string, key: string): unknown {
      return flags[key];
    },
    async setFlag(_scope: string, key: string, value: unknown): Promise<void> {
      flags[key] = value as NpcMemoryEntry[];
    },
  };
}

function makeMemory(overrides: Partial<NpcMemoryEntry> = {}): NpcMemoryEntry {
  return {
    id: `mem-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    playerName: "Alice",
    playerMessage: "Hello there",
    npcResponse: "Well met, traveler.",
    ...overrides,
  };
}

test("getMemories returns empty array when no flag is set", () => {
  const actor = makeActor();
  actor.flags["memories"] = undefined as unknown as NpcMemoryEntry[];
  assert.deepEqual(getMemories(actor as unknown as Parameters<typeof getMemories>[0]), []);
});

test("getMemories returns stored entries", () => {
  const entry = makeMemory({ id: "m1" });
  const actor = makeActor([entry]);
  const result = getMemories(actor as unknown as Parameters<typeof getMemories>[0]);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, "m1");
});

test("deleteMemory removes the entry with the matching id", async () => {
  const a = makeMemory({ id: "keep" });
  const b = makeMemory({ id: "remove" });
  const actor = makeActor([a, b]);
  await deleteMemory(actor as unknown as Parameters<typeof deleteMemory>[0], "remove");
  const result = actor.flags["memories"] ?? [];
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, "keep");
});

test("deleteMemory is a no-op when id is not found", async () => {
  const a = makeMemory({ id: "keep" });
  const actor = makeActor([a]);
  await deleteMemory(actor as unknown as Parameters<typeof deleteMemory>[0], "nonexistent");
  assert.equal((actor.flags["memories"] ?? []).length, 1);
});

test("clearMemories empties the array", async () => {
  const actor = makeActor([makeMemory(), makeMemory()]);
  await clearMemories(actor as unknown as Parameters<typeof clearMemories>[0]);
  assert.deepEqual(actor.flags["memories"], []);
});
