import {
  validateGetWorldSummaryOutput,
  type GetWorldSummaryOutput
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";

const SOURCE_PREFIX = "foundry";

export { LoreBridgeCapabilityError } from "./errors.js";

export function getWorldSummary(): GetWorldSummaryOutput {
  try {
    requireFoundryGm("getWorldSummary");

    const world = game.world;
    const system = game.system;
    const modulesCollection = game.modules;
    const actors = game.actors;
    const scenes = game.scenes;
    const journals = game.journal;

    if (!world || !system || !modulesCollection || !actors || !scenes || !journals) {
      throw new LoreBridgeCapabilityError(
        "ADAPTER_UNAVAILABLE",
        "The Foundry world is not fully initialized.",
        { retryable: true }
      );
    }

    const worldId = world.id;
    const modules = Array.from(modulesCollection.values());
    const summary: GetWorldSummaryOutput = {
      source: {
        sourceId: `${SOURCE_PREFIX}:${worldId}`,
        adapterType: "foundry"
      },
      world: {
        id: worldId,
        title: world.title,
        foundryVersion: game.version
      },
      system: {
        id: system.id,
        title: system.title,
        version: system.version
      },
      counts: {
        actors: actors.size,
        scenes: scenes.size,
        journals: journals.size,
        installedModules: modules.length,
        activeModules: modules.filter((module) => module.active).length
      }
    };

    const validation = validateGetWorldSummaryOutput(summary);
    if (!validation.valid || !validation.value) {
      throw new LoreBridgeCapabilityError(
        "INTERNAL_ERROR",
        "Foundry returned an invalid world summary.",
        { details: { validationErrors: validation.errors } }
      );
    }

    return validation.value;
  } catch (error) {
    if (error instanceof LoreBridgeCapabilityError) throw error;

    throw new LoreBridgeCapabilityError(
      "INTERNAL_ERROR",
      "LoreBridge could not build the Foundry world summary.",
      { cause: error }
    );
  }
}
