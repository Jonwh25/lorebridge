import assert from "node:assert/strict";
import test from "node:test";

import { handlePlayerLoreRequest, isPlayerLoreVisibleToAllPlayers } from "../src/capabilities/player-lore.js";
import { resetSearchCandidateLifecycleForTests } from "../src/capabilities/search-candidates.js";

type TestUser = { id: string; isGM: boolean; name: string };

function journalWithPermissions(permissions: Map<string, number>) {
  return {
    id: "journal-1",
    name: "Published Lore",
    testUserPermission(user: TestUser, permission: number): boolean {
      return (permissions.get(user.id) ?? 0) >= permission;
    },
  };
}

const gm: TestUser = { id: "gm", isGM: true, name: "GM" };
const playerOne: TestUser = { id: "player-1", isGM: false, name: "Player One" };
const playerTwo: TestUser = { id: "player-2", isGM: false, name: "Player Two" };

test("allows a journal observable by every non-GM user", () => {
  const journal = journalWithPermissions(new Map([
    [playerOne.id, 2],
    [playerTwo.id, 3],
  ]));

  assert.equal(isPlayerLoreVisibleToAllPlayers(journal, [gm, playerOne, playerTwo]), true);
});

test("rejects a journal when one player has an explicit denial", () => {
  const journal = journalWithPermissions(new Map([
    [playerOne.id, 2],
    [playerTwo.id, 0],
  ]));

  assert.equal(isPlayerLoreVisibleToAllPlayers(journal, [gm, playerOne, playerTwo]), false);
});

test("does not require a GM to have explicit journal ownership", () => {
  const journal = journalWithPermissions(new Map([
    [gm.id, 0],
    [playerOne.id, 2],
  ]));

  assert.equal(isPlayerLoreVisibleToAllPlayers(journal, [gm, playerOne]), true);
});

test("rechecks changed permissions instead of caching eligibility", () => {
  const permissions = new Map([[playerOne.id, 2]]);
  const journal = journalWithPermissions(permissions);

  assert.equal(isPlayerLoreVisibleToAllPlayers(journal, [playerOne]), true);
  permissions.set(playerOne.id, 0);
  assert.equal(isPlayerLoreVisibleToAllPlayers(journal, [playerOne]), false);
});

test("does not call the AI backend when no authorized Player Lore context remains", async () => {
  const keys = ["ChatMessage", "CONFIG", "fetch", "game"];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let fetchCalls = 0;
  const messages: Array<{ content: string }> = [];
  const users = Object.assign([gm, playerOne], { get: (id: string) => id === gm.id ? gm : id === playerOne.id ? playerOne : undefined });
  const pages: unknown[] = [];
  const journals = Object.assign([{
    id: "journal-1",
    uuid: "JournalEntry.journal-1",
    name: "Published Lore",
    pages,
    ownership: { default: 2 },
    testUserPermission: () => true,
  }], { search: () => [] });
  try {
    Object.defineProperty(globalThis, "CONFIG", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "game", { configurable: true, value: {
      user: { ...gm, isGM: true },
      users,
      world: { id: "cos", title: "Curse of Strahd" },
      journal: journals,
      settings: { get: (_module: string, key: string) => ({
        playerLoreEnabled: true,
        playerLoreAllowlist: JSON.stringify(["journal-1"]),
        backendUrl: "https://example.invalid",
        clientToken: "token",
      } as Record<string, unknown>)[key] },
    } });
    Object.defineProperty(globalThis, "ChatMessage", { configurable: true, value: { create: async (message: { content: string }) => { messages.push(message); return { id: "m1" }; } } });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { fetchCalls++; throw new Error("must not be called"); } });

    await handlePlayerLoreRequest(playerOne.id, "Who is missing?");
    assert.equal(fetchCalls, 0);
    assert.match(messages[0]?.content ?? "", /lore is silent/i);
  } finally {
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    resetSearchCandidateLifecycleForTests();
  }
});
