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
    this.details = options.details;
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

  if (!game.world || !game.system || !game.modules || !game.actors || !game.scenes || !game.journal) {
    throw new LoreBridgeCapabilityError(
      "ADAPTER_UNAVAILABLE",
      "The Foundry world is not fully initialized.",
      { retryable: true }
    );
  }
}

export function getWorldSummary(): GetWorldSummaryOutput {
  try {
    requireFoundryRuntime();

    const worldId = game.world.id;
    const modules = Array.from(game.modules.values());
    const summary: GetWorldSummaryOutput = {
      source: {
        sourceId: `${SOURCE_PREFIX}:${worldId}`,
        adapterType: "foundry"
      },
      world: {
        id: worldId,
        title: game.world.title,
        foundryVersion: game.version
      },
      system: {
        id: game.system.id,
        title: game.system.title,
        version: game.system.version
      },
      counts: {
        actors: game.actors.size,
        scenes: game.scenes.size,
        journals: game.journal.size,
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