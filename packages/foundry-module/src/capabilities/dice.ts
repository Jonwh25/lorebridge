import {
  MAX_DICE_RESULTS,
  validateRollDiceInput,
  validateRollDiceOutput,
  type RollDiceInput,
  type RollDiceOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";

function source(): Pick<RollDiceOutput, "sourceId" | "sourceName"> {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return { sourceId: `foundry:${game.world.id}`, sourceName: game.world.title };
}

function requestedDiceCount(formula: string): number {
  return [...formula.matchAll(/(?:^|[^a-zA-Z0-9_])(\d*)d(?:\d+|%|F)/gi)]
    .reduce((total, match) => total + Number(match[1] || "1"), 0);
}

export async function rollDice(input: RollDiceInput): Promise<RollDiceOutput> {
  requireFoundryGm("rollDice");
  const validated = validateRollDiceInput(input);
  if (!validated.valid || !validated.value) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Dice roll input is invalid.", { details: { validationErrors: validated.errors } });
  const { formula, postToChat = false } = validated.value;
  if (requestedDiceCount(formula) > MAX_DICE_RESULTS) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", `Dice formulas may roll at most ${MAX_DICE_RESULTS} dice.`);
  }
  if (!Roll.validate(formula)) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "The dice formula is not valid Foundry roll syntax.");

  let roll: InstanceType<typeof Roll>;
  try {
    roll = new Roll(formula);
    await roll.evaluate({ allowInteractive: false });
  } catch {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "The dice formula could not be evaluated by Foundry.");
  }
  if (typeof roll.total !== "number" || !Number.isFinite(roll.total)) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned an invalid dice roll total.");
  }
  const rolls = roll.dice.map((die) => ({
    faces: die.faces,
    results: die.results.map((result) => ({ value: result.result, active: result.active !== false })),
  }));
  if (rolls.reduce((total, die) => total + die.results.length, 0) > MAX_DICE_RESULTS) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", `Dice formulas may return at most ${MAX_DICE_RESULTS} dice results.`);
  }
  const output: RollDiceOutput = {
    ...source(), formula: roll.formula, total: roll.total, breakdown: roll.result || `${roll.formula} = ${roll.total}`,
    rolls, postedToChat: false,
  };
  if (postToChat) {
    const message = await roll.toMessage(
      { speaker: { alias: "LoreBridge" }, flavor: `LoreBridge roll: ${roll.formula}` },
      { create: true, messageMode: "public" },
    );
    if (!message?.id) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry could not create the dice roll chat message.");
    output.postedToChat = true;
    output.chatMessageId = message.id;
  }
  const outputValidation = validateRollDiceOutput(output);
  if (!outputValidation.valid || !outputValidation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned an invalid dice roll.", { details: { validationErrors: outputValidation.errors } });
  return outputValidation.value;
}
