import {
  validateGetWorldSummaryOutput,
  type GetWorldSummaryOutput
} from "@lorebridge/shared/capabilities";
import type { ProtocolErrorCode } from "@lorebridge/shared";

const SOURCE_PREFIX = "foundry";

export class LoreBridgeCapabilityError extends Error {
  readonly code: ProtocolErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ProtocolErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "LoreBridgeCapabilityError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

function requireFoundryRuntime(): void {
  if (typeof game === "undefined" || !game) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry runtime is not available.",
      { retryable: true }
    );
  }

  if (!game.user?.isGM) {
    throw new LoreBridgeCapabilityError(
      "NOT_AUTHORIZED",
      "LoreBridge getWorldSummary requires an active GM user."
    );
  }
}

export function getWorldSummary(): GetWorldSummaryOutput {
  try {
    requireFoundryRuntime();

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
