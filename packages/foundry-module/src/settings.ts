import { LoreBridgeConfigurationApp } from "./configuration-app.js";
import { LoreBridgeFeatureSettingsApp } from "./feature-settings-app.js";
import { LoreBridgeContextProfilesApp } from "./context-profiles-app.js";

const MODULE_ID = "lorebridge";

type FoundrySettingsApi = typeof game.settings & {
  registerMenu(
    moduleId: string,
    key: string,
    config: {
      name: string;
      label: string;
      hint: string;
      icon: string;
      type: typeof LoreBridgeConfigurationApp | typeof LoreBridgeFeatureSettingsApp | typeof LoreBridgeContextProfilesApp;
      restricted: boolean;
    },
  ): void;
  set(moduleId: string, key: string, value: unknown): Promise<unknown>;
  sheet?: { element: HTMLElement };
};

export function getFoundrySettingsApi(): FoundrySettingsApi {
  return game.settings as FoundrySettingsApi;
}

export const LOREBRIDGE_SETTINGS = Object.freeze({
  capabilityApiEnabled: "capabilityApiEnabled",
  remoteIntegrationEnabled: "remoteIntegrationEnabled",
  provider: "provider",
  backendUrl: "backendUrl",
  clientToken: "clientToken",
  sessionLogFolder: "sessionLogFolder",
  excludedCompendiums: "excludedCompendiums",
  writesEnabled: "writesEnabled",
  uiButtonsEnabled: "uiButtonsEnabled",
  chatCommandEnabled: "chatCommandEnabled",
  journalQaEnabled: "journalQaEnabled",
  contextProfiles: "contextProfiles",
  activeContextProfileId: "activeContextProfileId",
});

export type LoreBridgeProvider = "none" | "anthropic" | "openai";

export type LoreBridgeSettings = {
  capabilityApiEnabled: boolean;
  remoteIntegrationEnabled: boolean;
  provider: LoreBridgeProvider;
  backendUrl: string;
  clientToken: string;
  sessionLogFolder: string;
  excludedCompendiums: string;
  writesEnabled: boolean;
  uiButtonsEnabled: boolean;
  chatCommandEnabled: boolean;
  journalQaEnabled: boolean;
};

export function registerLoreBridgeSettings(): void {
  const settings = getFoundrySettingsApi();

  settings.registerMenu(MODULE_ID, "configuration", {
    name: "Configure LoreBridge",
    label: "Configure LoreBridge",
    hint: "Check the backend connection and pair this GM browser.",
    icon: "fas fa-bridge",
    type: LoreBridgeConfigurationApp,
    restricted: true,
  });

  settings.registerMenu(MODULE_ID, "features", {
    name: "Configure LoreBridge Features",
    label: "Configure Features",
    hint: "Choose which LoreBridge feature categories are available in this world.",
    icon: "fas fa-sliders-h",
    type: LoreBridgeFeatureSettingsApp,
    restricted: true,
  });

  settings.registerMenu(MODULE_ID, "contextProfiles", {
    name: "Configure Context Profiles",
    label: "Configure Profiles",
    hint: "Create and manage reusable scopes that limit which documents LoreBridge can access.",
    icon: "fas fa-filter",
    type: LoreBridgeContextProfilesApp,
    restricted: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.contextProfiles, {
    name: "LoreBridge Context Profiles",
    hint: "JSON array of context profile definitions.",
    scope: "world",
    config: false,
    type: String,
    default: "[]",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.activeContextProfileId, {
    name: "Active Context Profile",
    hint: "ID of the currently active context profile, or empty string for no restriction.",
    scope: "client",
    config: false,
    type: String,
    default: "",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.capabilityApiEnabled, {
    name: "Enable LoreBridge Capability API",
    hint: "Expose approved LoreBridge capabilities to the GM browser session.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, {
    name: "Enable Remote AI Integration",
    hint: "Allow LoreBridge to connect to a configured backend service. No provider API keys are stored in Foundry.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.provider, {
    name: "Remote AI Provider",
    hint: "Select the provider used by the LoreBridge backend. This does not store provider credentials in Foundry.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      none: "None",
      anthropic: "Claude (Anthropic)",
      openai: "OpenAI",
    },
    default: "none",
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.sessionLogFolder, {
    name: "Session Log Journal",
    hint: "Name of the journal that contains session log pages. Each page in this journal is treated as one session entry.",
    scope: "world",
    config: true,
    type: String,
    default: "Session Logs",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.excludedCompendiums, {
    name: "Excluded Compendiums",
    hint: "Comma-separated list of compendium pack IDs to hide from LoreBridge (e.g. dnd5e.spells,world.private).",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.writesEnabled, {
    name: "Enable AI-Proposed Writes",
    hint: "Allow AI assistants to propose journal page updates. Each change requires explicit GM approval before any content is modified.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.uiButtonsEnabled, {
    name: "Enable Foundry UI Buttons",
    hint: "Show LoreBridge generation and suggestion buttons on supported sheets.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.chatCommandEnabled, {
    name: "Enable /lb Chat Command",
    hint: "Allow LoreBridge /lb questions, roleplay, city, and NPC commands in chat.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.journalQaEnabled, {
    name: "Enable Journal Page Q&A Panel",
    hint: "Show the Ask LoreBridge panel on journal sheets.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, {
    name: "LoreBridge Backend URL",
    hint: "Browser-accessible HTTP(S) base URL for the LoreBridge backend.",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, {
    name: "LoreBridge Client Token",
    hint: "Signed pairing token for this GM browser.",
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
}

/**
 * The feature settings are edited through the dedicated submenu. They remain
 * registered with SettingsConfig so its Save Changes action can own the
 * standard world-reload confirmation, but are hidden from the general list.
 */
export function registerFeatureSettingsPresentation(): void {
  Hooks.on("renderApplicationV2", (app: unknown) => {
    const element = (app as { element?: HTMLElement }).element;
    if (!element) return;

    for (const setting of [
      LOREBRIDGE_SETTINGS.writesEnabled,
      LOREBRIDGE_SETTINGS.uiButtonsEnabled,
      LOREBRIDGE_SETTINGS.chatCommandEnabled,
      LOREBRIDGE_SETTINGS.journalQaEnabled,
    ]) {
      const input = element.querySelector<HTMLInputElement>(`input[name='${MODULE_ID}.${setting}']`);
      const row = input?.closest<HTMLElement>(".form-group");
      if (row) row.style.display = "none";
    }
  });
}

export function getLoreBridgeSettings(): LoreBridgeSettings {
  const settings = getFoundrySettingsApi();

  return {
    capabilityApiEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.capabilityApiEnabled),
    ),
    remoteIntegrationEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.remoteIntegrationEnabled),
    ),
    provider: normalizeProvider(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.provider),
    ),
    backendUrl: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl) ?? "",
    ).trim(),
    clientToken: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken) ?? "",
    ),
    sessionLogFolder: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.sessionLogFolder) ?? "Session Logs",
    ).trim(),
    excludedCompendiums: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.excludedCompendiums) ?? "",
    ).trim(),
    writesEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.writesEnabled),
    ),
    uiButtonsEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.uiButtonsEnabled) ?? true,
    ),
    chatCommandEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.chatCommandEnabled) ?? true,
    ),
    journalQaEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.journalQaEnabled) ?? true,
    ),
  };
}

function normalizeProvider(value: unknown): LoreBridgeProvider {
  if (value === "openai") return "openai";
  if (value === "anthropic") return "anthropic";
  return "none";
}
