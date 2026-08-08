import assert from "node:assert/strict";
import test from "node:test";

import { isPlayerLoreVisibleToAllPlayers } from "../src/capabilities/player-lore.js";

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
