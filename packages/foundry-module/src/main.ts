import {
  GET_WORLD_SUMMARY_CAPABILITY,
  GET_WORLD_SUMMARY_DECLARATION
} from "@lorebridge/shared/capabilities";
import { LOREBRIDGE_PROTOCOL_VERSION } from "@lorebridge/shared";

import { getWorldSummary } from "./capabilities/get-world-summary.js";

const MODULE_ID = "lorebridge";
const MODULE_VERSION = "0.1.1";

Hooks.once("init", () => {
  console.info(
    `${MODULE_ID} | Initializing LoreBridge ${MODULE_VERSION} (protocol ${LOREBRIDGE_PROTOCOL_VERSION})`
  );
});

Hooks.once("ready", () => {
  if (!game.user?.isGM) {
    console.info(`${MODULE_ID} | Capability API unavailable to non-GM user ${game.user?.name ?? "unknown"}`);
    return;
  }

  const summary = getWorldSummary();

  console.info(`${MODULE_ID} | GM bridge ready`, {
    moduleVersion: MODULE_VERSION,
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
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
      version: MODULE_VERSION,
      moduleVersion: MODULE_VERSION,
      protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
      capabilities: Object.freeze([GET_WORLD_SUMMARY_DECLARATION]),
      [GET_WORLD_SUMMARY_CAPABILITY]: getWorldSummary
    }),
    configurable: true,
    writable: false
  });
});