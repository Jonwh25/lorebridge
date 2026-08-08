import assert from "node:assert/strict";
import test from "node:test";
import {
  EXECUTE_COMBAT_WRITE_CAPABILITY,
  validateCombatWriteAuditResult,
  validateCombatWriteProposal,
  validateExecuteCombatWriteInput,
} from "../dist/capabilities.js";

const snapshot = {
  combatUuid: "Combat.c1", combatName: "Castle Battle", sceneId: "s1", round: 2, turn: 1,
  currentCombatantId: "cb2", combatants: [{ id: "cb1", initiative: 20 }, { id: "cb2", initiative: null }], fingerprint: "fnv1a-deadbeef",
};
const proposal = {
  action: "test", combatUuid: "Combat.c1", expectedRound: 2, expectedTurn: 1,
  target: { combatUuid: "Combat.c1" }, parameters: {}, rationale: "Verify safeguards.",
  beforeSummary: "Round 2, turn 1.", afterSummary: "No mutation.", snapshot,
};

test("validates the bounded combat-write foundation contract", () => {
  assert.equal(EXECUTE_COMBAT_WRITE_CAPABILITY, "executeCombatWrite");
  assert.equal(validateCombatWriteProposal(proposal).valid, true);
  assert.equal(validateExecuteCombatWriteInput({ proposal }).valid, true);
  assert.equal(validateCombatWriteAuditResult({ action: "test", target: { combatUuid: "Combat.c1" }, outcome: "approved", occurredAt: new Date().toISOString(), summary: "No mutation.", stateFingerprint: snapshot.fingerprint }).valid, true);
});

test("rejects mismatched, unbounded, and arbitrary combat writes", () => {
  assert.equal(validateCombatWriteProposal({ ...proposal, action: "nextTurn" }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, combatUuid: "Combat.other" }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, parameters: { method: "delete" } }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, snapshot: { ...snapshot, combatants: Array.from({ length: 201 }, (_, index) => ({ id: `c${index}`, initiative: null })) } }).valid, false);
});
