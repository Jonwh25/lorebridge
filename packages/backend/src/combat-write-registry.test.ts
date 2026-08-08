import assert from "node:assert/strict";
import test from "node:test";
import { CombatWriteRegistry, CombatWriteTokenError } from "./combat-write-registry.js";
import type { CombatWriteProposal } from "@lorebridge/shared/capabilities";

const proposal: CombatWriteProposal = {
  action: "test", combatUuid: "Combat.c1", expectedRound: 1, expectedTurn: 0,
  target: { combatUuid: "Combat.c1" }, parameters: {}, rationale: "Verify safeguards.",
  beforeSummary: "Round 1, turn 0.", afterSummary: "No mutation.",
  snapshot: { combatUuid: "Combat.c1", combatName: "Battle", round: 1, turn: 0, combatants: [], fingerprint: "fnv1a-12345678" },
};

test("combat-write tokens are short-lived and single-use", () => {
  let now = 1_000;
  const registry = new CombatWriteRegistry(() => now);
  const approved = registry.register(proposal, "proof-1", "foundry:cos", 100);
  assert.throws(() => registry.consume(approved.token, "wrong-proof"), (error) => error instanceof CombatWriteTokenError && error.reason === "not_authorized");
  assert.equal(registry.consume(approved.token, "proof-1").proposal.action, "test");
  assert.throws(() => registry.consume(approved.token, "proof-1"), (error) => error instanceof CombatWriteTokenError && error.reason === "already_used");

  const expired = registry.register(proposal, "proof-2", "foundry:cos", 10);
  now += 10;
  assert.throws(() => registry.consume(expired.token, "proof-2"), (error) => error instanceof CombatWriteTokenError && error.reason === "expired");
});

test("rejecting a proposal consumes it without execution", () => {
  const registry = new CombatWriteRegistry(() => 1_000);
  const entry = registry.register(proposal, "proof");
  assert.equal(registry.reject(entry.token, "proof").usedAt?.getTime(), 1_000);
  assert.throws(() => registry.consume(entry.token, "proof"), CombatWriteTokenError);
});
