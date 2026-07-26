import {
  GET_WORLD_SUMMARY_CAPABILITY,
  GET_WORLD_SUMMARY_DECLARATION
} from "@lorebridge/shared/capabilities";

import { getWorldSummary } from "./capabilities/get-world-summary.js";

const MODULE_ID = "lorebridge";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing LoreBridge 0.1.0`);
});

Hooks.once("ready", () => {
  if (!game.user?.isGM) {
    console.info(`${MODULE_ID} | Disabled for non-GM user ${game.user?.name ?? "unknown"}`);
    return;
  }

  const summary = getWorldSummary();

  console.info(`${MODULE_ID} | GM bridge ready`, {
    summary,
    capabilities: [GET_WORLD_SUMMARY_DECLARATION]
  });
  ui.notifications.info(
    `LoreBridge is ready for ${summary.world.title}. Open the browser console for world details.`
  );

  // Temporary local development API. It exposes only explicitly approved,
  // typed capabilities and will be replaced by an authenticated dispatcher.
  Object.defineProperty(globalThis, "LoreBridge", {
    value: Object.freeze({
      version: "0.1.0",
      capabilities: Object.freeze([GET_WORLD_SUMMARY_DECLARATION]),
      [GET_WORLD_SUMMARY_CAPABILITY]: getWorldSummary
    }),
    configurable: true,
    writable: false
  });
});
