const MODULE_ID = "lorebridge";

interface WorldSummary {
  foundryVersion: string;
  worldId: string;
  worldTitle: string;
  systemId: string;
  systemTitle: string;
  systemVersion: string;
  actorCount: number;
  sceneCount: number;
  journalCount: number;
  installedModuleCount: number;
  activeModuleCount: number;
}

function getWorldSummary(): WorldSummary {
  const modules = Array.from(game.modules.values());

  return {
    foundryVersion: game.version,
    worldId: game.world?.id ?? "unknown",
    worldTitle: game.world?.title ?? "Unknown World",
    systemId: game.system.id,
    systemTitle: game.system.title,
    systemVersion: game.system.version,
    actorCount: game.actors.size,
    sceneCount: game.scenes.size,
    journalCount: game.journal.size,
    installedModuleCount: modules.length,
    activeModuleCount: modules.filter((module) => module.active).length
  };
}

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing LoreBridge 0.1.0`);
});

Hooks.once("ready", () => {
  if (!game.user?.isGM) {
    console.info(`${MODULE_ID} | Disabled for non-GM user ${game.user?.name ?? "unknown"}`);
    return;
  }

  const summary = getWorldSummary();

  console.info(`${MODULE_ID} | GM bridge ready`, summary);
  ui.notifications.info(
    `LoreBridge is ready for ${summary.worldTitle}. Open the browser console for world details.`
  );

  // Temporary development API. This will be replaced by a typed, authenticated
  // request dispatcher before any external connection is introduced.
  Object.defineProperty(globalThis, "LoreBridge", {
    value: Object.freeze({
      version: "0.1.0",
      getWorldSummary
    }),
    configurable: true,
    writable: false
  });
});
