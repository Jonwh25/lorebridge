import {
  validateGetCombatStateInput,
  validateGetCombatStateOutput,
  type CombatantState,
  type GetCombatStateInput,
  type GetCombatStateOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";

function sourceId(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return `foundry:${game.world.id}`;
}

function sourceName(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return game.world.title;
}

function hitPoints(actor: FoundryActor | null | undefined): CombatantState["hitPoints"] | undefined {
  const hp = actor?.system.attributes;
  if (!hp || typeof hp !== "object") return undefined;
  const value = (hp as Record<string, unknown>).hp;
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).value !== "number") return undefined;
  const raw = value as Record<string, unknown>;
  const output: NonNullable<CombatantState["hitPoints"]> = { current: raw.value as number };
  if (typeof raw.max === "number") output.maximum = raw.max;
  if (typeof raw.temp === "number") output.temporary = raw.temp;
  return output;
}

function isHiddenFromPlayers(combatant: FoundryCombatant): boolean {
  return combatant.hidden || !isPlayerVisible(combatant.actor?.ownership);
}

function normalizeCombatant(combatant: FoundryCombatant, includeHitPoints: boolean): CombatantState {
  const output: CombatantState = {
    id: combatant.id,
    name: combatant.name,
    defeated: combatant.isDefeated,
  };
  if (typeof combatant.initiative === "number") output.initiative = combatant.initiative;
  if (combatant.actor) {
    output.actorId = combatant.actor.id;
    output.actorUuid = combatant.actor.uuid;
    output.actorType = combatant.actor.type;
  }
  if (combatant.tokenId) output.tokenId = combatant.tokenId;
  if (includeHitPoints) {
    const hp = hitPoints(combatant.actor);
    if (hp) output.hitPoints = hp;
  }
  return output;
}

export function getCombatState(input: GetCombatStateInput): GetCombatStateOutput {
  requireFoundryGm("getCombatState");
  const validated = validateGetCombatStateInput(input);
  if (!validated.valid || !validated.value) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Combat state input is invalid.", { details: { validationErrors: validated.errors } });
  if (!game.combats) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry combat collection is unavailable.", { retryable: true });

  const combat = game.combats.active;
  if (!combat) {
    return { sourceId: sourceId(), sourceName: sourceName(), active: false, started: false, combatants: [], hiddenCount: 0 };
  }
  const playerMode = validated.value.mode === "player";
  let hiddenCount = 0;
  const combatants = combat.turns.flatMap((combatant) => {
    if (playerMode && isHiddenFromPlayers(combatant)) { hiddenCount++; return []; }
    return [normalizeCombatant(combatant, !playerMode)];
  });
  const currentCombatant = combat.combatant;
  const currentCombatantId = currentCombatant && (!playerMode || !isHiddenFromPlayers(currentCombatant)) ? currentCombatant.id : undefined;
  const output: GetCombatStateOutput = {
    sourceId: sourceId(), sourceName: sourceName(), active: combat.active, started: combat.started,
    combatants, hiddenCount,
  };
  if (typeof combat.current.round === "number") output.round = combat.current.round;
  if (typeof combat.current.turn === "number") output.turn = combat.current.turn;
  if (currentCombatantId) output.currentCombatantId = currentCombatantId;
  const outputValidation = validateGetCombatStateOutput(output);
  if (!outputValidation.valid || !outputValidation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned an invalid combat state.", { details: { validationErrors: outputValidation.errors } });
  return outputValidation.value;
}
