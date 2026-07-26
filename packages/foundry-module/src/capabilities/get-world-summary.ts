import type { GetWorldSummaryOutput } from "@lorebridge/shared/capabilities";

const SOURCE_PREFIX = "foundry";

export function getWorldSummary(): GetWorldSummaryOutput {
  if (!game.user?.isGM) {
    throw new Error("LoreBridge getWorldSummary requires an active GM user");
  }

  const worldId = game.world?.id ?? "unknown";
  const modules = Array.from(game.modules.values());

  return {
    source: {
      sourceId: `${SOURCE_PREFIX}:${worldId}`,
      adapterType: "foundry"
    },
    world: {
      id: worldId,
      title: game.world?.title ?? "Unknown World",
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
}
