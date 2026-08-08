import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
const originalFoundry = Object.getOwnPropertyDescriptor(globalThis, "foundry");
let captureCombatWriteSnapshot: typeof import("../src/capabilities/combat-writes.js").captureCombatWriteSnapshot;
let executeCombatWrite: typeof import("../src/capabilities/combat-writes.js").executeCombatWrite;

before(async () => {
  class TestApplicationV2 {}
  Object.defineProperty(globalThis, "foundry", { configurable: true, value: { applications: { api: { ApplicationV2: TestApplicationV2 } } } });
  ({ captureCombatWriteSnapshot, executeCombatWrite } = await import("../src/capabilities/combat-writes.js"));
});

afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame); else Reflect.deleteProperty(globalThis, "game");
});

function installGame(turn = 0): void {
  const combatants = [{ id: "cb1", name: "Strahd", initiative: 20, hidden: false, isDefeated: false }, { id: "cb2", name: "Ireena", initiative: 15, hidden: false, isDefeated: false }];
  Object.defineProperty(globalThis, "game", { configurable: true, value: {
    user: { id: "gm1", name: "GM", isGM: true }, world: { id: "cos", title: "Curse of Strahd" },
    settings: { get(_module: string, key: string) { if (key === "combatWritesEnabled") return true; if (key === "backendUrl") return "https://example.invalid"; if (key === "clientToken") return "token"; return false; } },
    combats: { active: { id: "c1", uuid: "Combat.c1", name: "Castle Battle", scene: { id: "s1" }, active: true, started: true, current: { round: 2, turn }, combatant: combatants[turn], turns: combatants } },
  } });
}

test("captures a bounded deterministic combat snapshot", () => {
  installGame();
  const first = captureCombatWriteSnapshot();
  const second = captureCombatWriteSnapshot();
  assert.equal(first.combatUuid, "Combat.c1");
  assert.equal(first.combatants.length, 2);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("synthetic execution approves unchanged state and rejects stale state without mutation", () => {
  installGame();
  const snapshot = captureCombatWriteSnapshot();
  const proposal = { action: "test" as const, combatUuid: snapshot.combatUuid, expectedRound: snapshot.round, expectedTurn: snapshot.turn, target: { combatUuid: snapshot.combatUuid }, parameters: {}, rationale: "Verify safeguards.", beforeSummary: "Before.", afterSummary: "No mutation.", snapshot };
  assert.equal(executeCombatWrite({ proposal }).outcome, "approved");
  installGame(1);
  assert.equal(executeCombatWrite({ proposal }).outcome, "stale");
});

test("combat execution requires a GM and the separate feature gate", () => {
  installGame();
  (game as unknown as { user: { isGM: boolean } }).user.isGM = false;
  assert.throws(() => captureCombatWriteSnapshot(), /requires an active GM user/i);
  installGame();
  (game.settings as unknown as { get: (_module: string, key: string) => unknown }).get = (_module, key) => key === "combatWritesEnabled" ? false : "configured";
  const snapshot = captureCombatWriteSnapshot();
  assert.throws(() => executeCombatWrite({ proposal: { action: "test", combatUuid: snapshot.combatUuid, expectedRound: snapshot.round, expectedTurn: snapshot.turn, target: { combatUuid: snapshot.combatUuid }, parameters: {}, rationale: "Verify.", beforeSummary: "Before.", afterSummary: "After.", snapshot } }), /disabled/i);
});

afterEach(() => {
  if (originalFoundry) Object.defineProperty(globalThis, "foundry", originalFoundry);
});
