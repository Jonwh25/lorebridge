import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getCombatState } from "../src/capabilities/combat.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => { if (originalGame) Object.defineProperty(globalThis, "game", originalGame); else Reflect.deleteProperty(globalThis, "game"); });

test("returns inactive state and bounds player combat details", () => {
  Object.defineProperty(globalThis, "game", { configurable: true, value: { user: { isGM: true, name: "GM" }, world: { id: "cos", title: "Curse of Strahd" }, combats: { active: null } } });
  assert.equal(getCombatState({}).active, false);
  const actor = { id: "a1", uuid: "Actor.a1", name: "Strahd", type: "npc", system: { attributes: { hp: { value: 44, max: 100 } } }, ownership: { default: 3 } };
  const hidden = { id: "c2", name: "Hidden", hidden: true, isDefeated: false, actor };
  const visible = { id: "c1", name: "Strahd", initiative: 20, hidden: false, isDefeated: false, tokenId: "t1", actor };
  (game as unknown as { combats: unknown }).combats = { active: { active: true, started: true, current: { round: 2, turn: 0 }, combatant: visible, turns: [visible, hidden] } };
  const gm = getCombatState({ mode: "gm" });
  assert.equal(gm.combatants[0]?.hitPoints?.current, 44);
  const player = getCombatState({ mode: "player" });
  assert.equal(player.combatants.length, 1);
  assert.equal(player.combatants[0]?.hitPoints, undefined);
  assert.equal(player.hiddenCount, 1);
});
