import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
const originalFoundry = Object.getOwnPropertyDescriptor(globalThis, "foundry");
const originalUi = Object.getOwnPropertyDescriptor(globalThis, "ui");
let captureCombatWriteSnapshot: typeof import("../src/capabilities/combat-writes.js").captureCombatWriteSnapshot;
let executeCombatWrite: typeof import("../src/capabilities/combat-writes.js").executeCombatWrite;
let notifyCombatWriteResult: typeof import("../src/capabilities/combat-writes.js").notifyCombatWriteResult;
let replaceApprovalQueueHtml: typeof import("../src/approval-queue-panel.js").replaceApprovalQueueHtml;

before(async () => {
  class TestApplicationV2 {}
  Object.defineProperty(globalThis, "foundry", { configurable: true, value: { applications: { api: { ApplicationV2: TestApplicationV2 } } } });
  ({ replaceApprovalQueueHtml } = await import("../src/approval-queue-panel.js"));
  ({ captureCombatWriteSnapshot, executeCombatWrite, notifyCombatWriteResult } = await import("../src/capabilities/combat-writes.js"));
});

afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame); else Reflect.deleteProperty(globalThis, "game");
  if (originalUi) Object.defineProperty(globalThis, "ui", originalUi); else Reflect.deleteProperty(globalThis, "ui");
});

function installGame(turn = 0, round = 2): void {
  const combatants = [{ id: "cb1", name: "Strahd", initiative: 20, hidden: false, isDefeated: false }, { id: "cb2", name: "Ireena", initiative: 15, hidden: false, isDefeated: false }];
  const combat = { id: "c1", uuid: "Combat.c1", name: "Castle Battle", scene: { id: "s1" }, active: true, started: true, current: { round, turn }, combatant: combatants[turn]!, turns: combatants,
    async nextTurn() { this.current.turn = (this.current.turn + 1) % this.turns.length; if (this.current.turn === 0) this.current.round += 1; this.combatant = this.turns[this.current.turn]!; return this; } };
  Object.defineProperty(globalThis, "game", { configurable: true, value: {
    user: { id: "gm1", name: "GM", isGM: true }, world: { id: "cos", title: "Curse of Strahd" },
    settings: { get(_module: string, key: string) { if (key === "combatWritesEnabled") return true; if (key === "backendUrl") return "https://example.invalid"; if (key === "clientToken") return "token"; return false; } },
    combats: { active: combat },
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

test("synthetic execution approves unchanged state and rejects stale state without mutation", async () => {
  installGame();
  const snapshot = captureCombatWriteSnapshot();
  const proposal = { action: "test" as const, combatUuid: snapshot.combatUuid, expectedRound: snapshot.round, expectedTurn: snapshot.turn, target: { combatUuid: snapshot.combatUuid }, parameters: {}, rationale: "Verify safeguards.", beforeSummary: "Before.", afterSummary: "No mutation.", snapshot };
  assert.equal((await executeCombatWrite({ proposal })).outcome, "approved");
  installGame(1);
  assert.equal((await executeCombatWrite({ proposal })).outcome, "stale");
});

test("next-turn execution advances exactly once and enters the next round", async () => {
  installGame(1, 2);
  const snapshot = captureCombatWriteSnapshot();
  const proposal = { action: "nextTurn" as const, combatUuid: snapshot.combatUuid, expectedRound: snapshot.round, expectedTurn: snapshot.turn, target: { combatUuid: snapshot.combatUuid }, parameters: { expectedNextCombatantId: "cb1" }, rationale: "Continue combat.", beforeSummary: "Ireena acts.", afterSummary: "Strahd acts in round 3.", snapshot };
  const result = await executeCombatWrite({ proposal });
  assert.equal(result.outcome, "approved");
  assert.deepEqual([result.resultingRound, result.resultingTurn, result.resultingCombatantId], [3, 0, "cb1"]);
  assert.deepEqual([game.combats.active?.current.round, game.combats.active?.current.turn], [3, 0]);
});

test("next-turn execution rejects a changed roster without calling Foundry nextTurn", async () => {
  installGame();
  const snapshot = captureCombatWriteSnapshot();
  const proposal = { action: "nextTurn" as const, combatUuid: snapshot.combatUuid, expectedRound: snapshot.round, expectedTurn: snapshot.turn, target: { combatUuid: snapshot.combatUuid }, parameters: { expectedNextCombatantId: "cb2" }, rationale: "Continue combat.", beforeSummary: "Strahd acts.", afterSummary: "Ireena acts.", snapshot };
  game.combats.active!.turns.reverse();
  assert.equal((await executeCombatWrite({ proposal })).outcome, "stale");
  assert.equal(game.combats.active!.current.turn, 0);
});

test("combat execution requires a GM and the separate feature gate", async () => {
  installGame();
  (game as unknown as { user: { isGM: boolean } }).user.isGM = false;
  assert.throws(() => captureCombatWriteSnapshot(), /requires an active GM user/i);
  installGame();
  (game.settings as unknown as { get: (_module: string, key: string) => unknown }).get = (_module, key) => key === "combatWritesEnabled" ? false : "configured";
  const snapshot = captureCombatWriteSnapshot();
  await assert.rejects(executeCombatWrite({ proposal: { action: "test", combatUuid: snapshot.combatUuid, expectedRound: snapshot.round, expectedTurn: snapshot.turn, target: { combatUuid: snapshot.combatUuid }, parameters: {}, rationale: "Verify.", beforeSummary: "Before.", afterSummary: "After.", snapshot } }), /disabled/i);
});

test("notifies through the Foundry notification object without losing method context", () => {
  const calls: string[] = [];
  const notifications = {
    prefix: "bound",
    info(this: { prefix: string }, message: string) { calls.push(`${this.prefix}:info:${message}`); },
    warn(this: { prefix: string }, message: string) { calls.push(`${this.prefix}:warn:${message}`); },
    error() {},
  };
  Object.defineProperty(globalThis, "ui", { configurable: true, value: { notifications } });
  notifyCombatWriteResult({ action: "test", target: { combatUuid: "Combat.c1" }, outcome: "approved", occurredAt: new Date().toISOString(), summary: "Approved." });
  notifyCombatWriteResult({ action: "test", target: { combatUuid: "Combat.c1" }, outcome: "stale", occurredAt: new Date().toISOString(), summary: "Stale." });
  assert.deepEqual(calls, ["bound:info:LoreBridge combat write: Approved.", "bound:warn:LoreBridge combat write: Stale."]);
});

test("preserves the scroll container when replacing approval panel content", () => {
  const result = { className: "lb-approval-queue" } as HTMLElement;
  let replacement: unknown;
  const content = {
    replaceChildren(...nodes: unknown[]) { replacement = nodes; },
  } as unknown as HTMLElement;

  replaceApprovalQueueHtml(result, content);

  assert.deepEqual(replacement, [result]);
});

afterEach(() => {
  if (originalFoundry) Object.defineProperty(globalThis, "foundry", originalFoundry);
});
