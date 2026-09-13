import assert from "node:assert/strict";
import test from "node:test";
import { getAttackOutcome } from "../src/capabilities/combat-narrator.js";

const attackRoll = (results: Array<{ result: number; active?: boolean; discarded?: boolean; rerolled?: boolean }>) => [
  { dice: [{ faces: 20, results }] },
];

test("combat narrator detects active natural 20s and natural 1s", () => {
  assert.equal(getAttackOutcome(attackRoll([{ result: 20, active: true }])), "critical");
  assert.equal(getAttackOutcome(attackRoll([{ result: 1, active: true }])), "fumble");
  assert.equal(getAttackOutcome(attackRoll([{ result: 14, active: true }])), undefined);
});

test("combat narrator ignores discarded, inactive, and rerolled d20 results", () => {
  assert.equal(getAttackOutcome(attackRoll([{ result: 20, discarded: true }])), undefined);
  assert.equal(getAttackOutcome(attackRoll([{ result: 1, active: false }])), undefined);
  assert.equal(getAttackOutcome(attackRoll([{ result: 20, rerolled: true }])), undefined);
});
