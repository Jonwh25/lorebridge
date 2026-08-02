import assert from "node:assert/strict";
import test from "node:test";
import { GET_COMBAT_STATE_CAPABILITY, validateGetCombatStateInput, validateGetCombatStateOutput } from "../dist/capabilities.js";

test("validates the combat capability contract", () => {
  assert.equal(GET_COMBAT_STATE_CAPABILITY, "getCombatState");
  assert.equal(validateGetCombatStateInput({ mode: "gm" }).valid, true);
  assert.equal(validateGetCombatStateInput({ mode: "bad" }).valid, false);
  assert.equal(validateGetCombatStateOutput({ sourceId: "foundry:cos", sourceName: "Curse of Strahd", active: false, started: false, combatants: [], hiddenCount: 0 }).valid, true);
  assert.equal(validateGetCombatStateOutput({ sourceId: "foundry:cos", active: true, started: true, combatants: [], hiddenCount: 0 }).valid, false);
});
