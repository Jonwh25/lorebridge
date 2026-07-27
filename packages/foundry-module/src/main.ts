import {
  GET_WORLD_SUMMARY_CAPABILITY,
  GET_WORLD_SUMMARY_DECLARATION
} from "@lorebridge/shared/capabilities";
import { LOREBRIDGE_PROTOCOL_VERSION } from "@lorebridge/shared";

import { getWorldSummary } from "./capabilities/get-world-summary.js";
import { shouldExposeCapabilityApi } from "./runtime-policy.js";
import {
  getLoreBridgeSettings,
  registerLoreBridgeSettings
} from "./settings.js";

const MODULE_ID = "lorebridge";

type FoundryModuleMetadata = {
  version?: string;
};

function getModuleVersion(): string {
  const moduleMetadata = game.modules.get(MODULE_ID) as FoundryModuleMetadata | undefined;
  return moduleMetadata?.version ?? "unknown";
}

Hooks.once("init", () => {
  registerLoreBridgeSettings();

  console.info(
    `${MODULE_ID} | Initializing LoreBridge ${getModuleVersion()} (protocol ${LOREBRIDGE_PROTOCOL_VERSION})`
  );
});

Hooks.once("ready", () => {
  const settings = getLoreBridgeSettings();
  const isGM = Boolean(game.user?.isGM);

  if (!shouldExposeCapabilityApi(isGM, settings)) {
    if (!isGM) {
      console.info(`${MODULE_ID} | Capability API unavailable to non-GM user ${game.user?.name ?? "unknown"}`);
    } else {
      console.info(`${MODULE_ID} | Capability API disabled in world settings`);
    }
    return;
  }

  if (settings.remoteIntegrationEnabled) {
    if (settings.provider === "none") {
      ui.notifications.warn("LoreBridge remote integration is enabled, but no provider is selected.");
    } else if (!settings.backendUrl) {
      ui.notifications.warn("LoreBridge remote integration is enabled, but no backend URL is configured.");
    } else {
      console.info(`${MODULE_ID} | Remote integration configured`, {
        provider: settings.provider,
        backendUrl: settings.backendUrl
      });
    }
  }

  const moduleVersion = getModuleVersion();
  const summary = getWorldSummary();

  console.info(`${MODULE_ID} | GM bridge ready`, {
    moduleVersion,
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    settings: {
      capabilityApiEnabled: settings.capabilityApiEnabled,
      remoteIntegrationEnabled: settings.remoteIntegrationEnabled,
      provider: settings.provider,
      backendConfigured: Boolean(settings.backendUrl)
    },
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
      version: moduleVersion,
      moduleVersion,
      protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
      capabilities: Object.freeze([GET_WORLD_SUMMARY_DECLARATION]),
      settings: Object.freeze({ ...settings, backendUrl: settings.backendUrl ? "configured" : "" }),
      [GET_WORLD_SUMMARY_CAPABILITY]: getWorldSummary
    }),
    configurable: true,
    writable: false
  });
});
