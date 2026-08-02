import assert from "node:assert/strict";
import test from "node:test";
import { ROLL_DICE_CAPABILITY, validateRollDiceInput, validateRollDiceOutput } from "../dist/capabilities.js";

test("validates the dice roll capability contract", () => {
  assert.equal(ROLL_DICE_CAPABILITY, "rollDice");
  assert.equal(validateRollDiceInput({ formula: "4d6kh3" }).valid, true);
  assert.equal(validateRollDiceInput({ formula: "" }).valid, false);
  assert.equal(validateRollDiceInput({ formula: "1d20", postToChat: "yes" }).valid, false);
  assert.equal(validateRollDiceOutput({ sourceId: "foundry:cos", sourceName: "Curse of Strahd", formula: "2d6", total: 8, breakdown: "3 + 5", rolls: [{ faces: 6, results: [{ value: 3, active: true }, { value: 5, active: true }] }], postedToChat: false }).valid, true);
  assert.equal(validateRollDiceOutput({ sourceId: "foundry:cos", sourceName: "Curse of Strahd", formula: "2d6", total: 8, breakdown: "3 + 5", rolls: [], postedToChat: true }).valid, false);
});
