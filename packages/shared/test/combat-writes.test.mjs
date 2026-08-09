import assert from "node:assert/strict";
import test from "node:test";
import {
  EXECUTE_COMBAT_WRITE_CAPABILITY,
  validateCombatWriteAuditResult,
  validateCombatWriteProposal,
  validateExecuteCombatWriteInput,
  validateProposeCombatWriteInput,
} from "../dist/capabilities.js";

const snapshot = {
  combatUuid: "Combat.c1", combatName: "Castle Battle", sceneId: "s1", round: 2, turn: 1,
  currentCombatantId: "cb2", combatants: [{ id: "cb1", name: "Strahd", initiative: 20 }, { id: "cb2", name: "Ireena", initiative: null }], fingerprint: "fnv1a-deadbeef",
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
  assert.equal(validateCombatWriteProposal({ ...proposal, action: "deleteCombat" }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, action: "nextTurn", parameters: { expectedNextCombatantId: "cb1" } }).valid, true);
  assert.equal(validateCombatWriteProposal({ ...proposal, action: "nextTurn", parameters: { expectedNextCombatantId: "cb2" } }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, action: "setInitiative", parameters: { combatantId: "cb1", expectedInitiative: 20, initiative: 25 } }).valid, true);
  assert.equal(validateCombatWriteProposal({ ...proposal, action: "setInitiative", parameters: { combatantId: "cb1", expectedInitiative: 20, initiative: Number.POSITIVE_INFINITY } }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, action: "setInitiative", parameters: { combatantId: "missing", expectedInitiative: 20, initiative: 25 } }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, combatUuid: "Combat.other" }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, parameters: { method: "delete" } }).valid, false);
  assert.equal(validateCombatWriteProposal({ ...proposal, snapshot: { ...snapshot, combatants: Array.from({ length: 201 }, (_, index) => ({ id: `c${index}`, initiative: null })) } }).valid, false);
});

test("requires bounded resulting order for approved initiative writes", () => {
  const base = { action: "setInitiative", target: { combatUuid: "Combat.c1" }, outcome: "approved", occurredAt: new Date().toISOString(), summary: "Initiative updated." };
  assert.equal(validateCombatWriteAuditResult(base).valid, false);
  assert.equal(validateCombatWriteAuditResult({ ...base, resultingCombatants: [{ id: "cb1", name: "Strahd", initiative: 25, position: 1 }] }).valid, true);
});

test("rejects invalid initiative values before proposal creation", () => {
  const base = { action: "setInitiative", combatantId: "cb1", initiative: 20, rationale: "Correct initiative." };
  assert.equal(validateProposeCombatWriteInput(base).valid, true);
  assert.equal(validateProposeCombatWriteInput({ ...base, initiative: Number.NaN }).valid, false);
  assert.equal(validateProposeCombatWriteInput({ ...base, initiative: 1001 }).valid, false);
  assert.equal(validateProposeCombatWriteInput({ ...base, combatantId: "" }).valid, false);
});
