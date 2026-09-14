import assert from "node:assert/strict";
import test from "node:test";
import { createCombatFlavorPrompt } from "./generation.js";

const baseInput = {
  attackerName: "Ireena",
  targetName: "Zombie",
  damage: 8,
  isCrit: false,
  isFumble: false,
  isKillingBlow: false,
  style: "dramatic" as const,
};

test("combat flavor prompts distinguish regular, critical, and fumble events", () => {
  assert.match(createCombatFlavorPrompt(baseInput), /describing this attack/);
  assert.match(createCombatFlavorPrompt({ ...baseInput, isCrit: true }), /spectacular, fate-defying natural 20 critical hit/);
  const fumble = createCombatFlavorPrompt({ ...baseInput, targetName: "", isFumble: true });
  assert.match(fumble, /attacker's humiliating fumble/);
  assert.match(fumble, /attacker embarrasses themself, never the target/);
});
