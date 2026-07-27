const MODULE_ID = "lorebridge";

export const LOREBRIDGE_SETTINGS = Object.freeze({
  capabilityApiEnabled: "capabilityApiEnabled",
  remoteIntegrationEnabled: "remoteIntegrationEnabled",
  provider: "provider",
  backendUrl: "backendUrl"
});

export type LoreBridgeProvider = "none" | "openai";

export type LoreBridgeSettings = {
  capabilityApiEnabled: boolean;
  remoteIntegrationEnabled: boolean;
  provider: LoreBridgeProvider;
  backendUrl: string;
};

export function registerLoreBridgeSettings(): void {
  game.settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.capabilityApiEnabled, {
    name: "Enable LoreBridge Capability API",
    hint: "Expose approved LoreBridge capabilities to the GM browser session.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, {
    name: "Enable Remote AI Integration",
    hint: "Allow LoreBridge to connect to a configured backend service. No provider API keys are stored in Foundry.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.provider, {
    name: "Remote AI Provider",
    hint: "Select the provider used by the LoreBridge backend. This does not store provider credentials in Foundry.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      none: "None",
      openai: "OpenAI"
    },
    default: "none",
    requiresReload: true
  });

  game.settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, {
    name: "LoreBridge Backend URL",
    hint: "WebSocket URL for the LoreBridge backend, for example wss://lorebridge.example.com/ws.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    requiresReload: true
  });
}

export function getLoreBridgeSettings(): LoreBridgeSettings {
  return {
    capabilityApiEnabled: Boolean(
      game.settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.capabilityApiEnabled)
    ),
    remoteIntegrationEnabled: Boolean(
      game.settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)
    ),
    provider: normalizeProvider(
      game.settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.provider)
    ),
    backendUrl: String(
      game.settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl) ?? ""
    ).trim()
  };
}

function normalizeProvider(value: unknown): LoreBridgeProvider {
  return value === "openai" ? "openai" : "none";
}
