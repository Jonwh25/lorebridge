import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  getLoreBridgeSettings,
  LOREBRIDGE_SETTINGS,
  registerLoreBridgeSettings,
} from "../src/settings.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");

afterEach(() => {
  if (originalGame) {
    Object.defineProperty(globalThis, "game", originalGame);
  } else {
    Reflect.deleteProperty(globalThis, "game");
  }
});

function setGame(value: unknown): void {
  Object.defineProperty(globalThis, "game", {
    value,
    configurable: true,
    writable: true,
  });
}

test("registers safe world and client scoped defaults", () => {
  const registrations = new Map<string, Record<string, unknown>>();
  const menus = new Map<string, Record<string, unknown>>();

  setGame({
    settings: {
      register(_moduleId: string, key: string, config: Record<string, unknown>) {
        registrations.set(key, config);
      },
      registerMenu(_moduleId: string, key: string, config: Record<string, unknown>) {
        menus.set(key, config);
      },
      get() {
        return undefined;
      },
      async set() {
        return undefined;
      },
    },
  });

  registerLoreBridgeSettings();

  assert.equal(menus.size, 1);
  assert.equal(menus.get("workspace")?.restricted, true);

  assert.equal(registrations.size, 43);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.campaignCodexEnabled)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.campaignCodexEnabled)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.campaignCodexEnabled)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.campaignCodexEnabled)?.requiresReload, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerLoreEnabled)?.default, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerLoreEnabled)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerLoreEnabled)?.requiresReload, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerLoreAllowlist)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerLoreAllowlist)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerLoreAllowlist)?.default, "[]");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.capabilityApiEnabled)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)?.default, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.provider)?.default, "none");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backendUrl)?.default, "");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.clientToken)?.default, "");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.uiButtonsEnabled)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.chatCommandEnabled)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.journalQaEnabled)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.writesEnabled)?.requiresReload, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.combatWritesEnabled)?.default, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.combatWritesEnabled)?.requiresReload, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.uiButtonsEnabled)?.requiresReload, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.chatCommandEnabled)?.requiresReload, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.journalQaEnabled)?.requiresReload, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcMentionEnabled)?.default, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcMentionEnabled)?.requiresReload, true);

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.capabilityApiEnabled)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.capabilityApiEnabled)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.provider)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.provider)?.config, false);

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backendUrl)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backendUrl)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.clientToken)?.scope, "client");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.clientToken)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.contextProfiles)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.contextProfiles)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.activeContextProfileId)?.scope, "client");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.activeContextProfileId)?.config, false);

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.generationHistory)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.generationHistory)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.generationHistory)?.default, "[]");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.maxHistoryLength)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.maxHistoryLength)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.maxHistoryLength)?.default, 10);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.historySaveImages)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.historySaveImages)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.historySaveImages)?.default, true);

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabProfileVisible)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabProfileVisible)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabProfileVisible)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabProfilePlayerHidden)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabProfilePlayerHidden)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabProfilePlayerHidden)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabRoleplayVisible)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabRoleplayVisible)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabRoleplayPlayerHidden)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabRoleplayPlayerHidden)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabKnowledgeVisible)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabKnowledgeVisible)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabKnowledgePlayerHidden)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.npcTabKnowledgePlayerHidden)?.default, true);

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.lorefolderPath)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.lorefolderPath)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.lorefolderPath)?.default, "lorebridge");

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.portraitMatchRoot)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.portraitMatchRoot)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.portraitMatchRoot)?.default, "Artwork/Portraits/NPCs");

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerCharacterNames)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerCharacterNames)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.playerCharacterNames)?.default, "");

  // Backup config — general
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathNpcs)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathNpcs)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathNpcs)?.default, "02-actors/npcs");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathPlayers)?.default, "02-actors/players");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathJournals)?.default, "07-foundry/journals");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathMacros)?.default, "07-foundry/macros");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathSessionLogs)?.default, "01-sessions");

  // Backup config — Campaign Codex
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathCcEntries)?.default, "07-foundry/cc-entries");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathCcFactions)?.default, "04-world/cc-factions");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathCcGroups)?.default, "04-world/cc-groups");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathCcLocations)?.default, "04-world/cc-locations");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathCcNpcs)?.default, "02-actors/cc-npcs");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathCcQuests)?.default, "03-quests/cc-quests");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backupPathCcRegions)?.default, "04-world/cc-regions");
});

test("reads and normalizes configured values", () => {
  const values = new Map<string, unknown>([
    [LOREBRIDGE_SETTINGS.capabilityApiEnabled, true],
    [LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, true],
    [LOREBRIDGE_SETTINGS.provider, "openai"],
    [LOREBRIDGE_SETTINGS.backendUrl, "  https://lorebridge.example/api/  "],
    [LOREBRIDGE_SETTINGS.clientToken, "signed-client-token"],
    [LOREBRIDGE_SETTINGS.writesEnabled, true],
    [LOREBRIDGE_SETTINGS.combatWritesEnabled, true],
    [LOREBRIDGE_SETTINGS.uiButtonsEnabled, false],
    [LOREBRIDGE_SETTINGS.chatCommandEnabled, false],
    [LOREBRIDGE_SETTINGS.journalQaEnabled, false],
  ]);

  setGame({
    settings: {
      register() {},
      registerMenu() {},
      get(_moduleId: string, key: string) {
        return values.get(key);
      },
      async set() {
        return undefined;
      },
    },
  });

  assert.deepEqual(getLoreBridgeSettings(), {
    capabilityApiEnabled: true,
    remoteIntegrationEnabled: true,
    provider: "openai",
    backendUrl: "https://lorebridge.example/api/",
    clientToken: "signed-client-token",
    sessionLogFolder: "Session Logs",
    excludedCompendiums: "",
    writesEnabled: true,
    combatWritesEnabled: true,
    uiButtonsEnabled: false,
    chatCommandEnabled: false,
    journalQaEnabled: false,
    npcMentionEnabled: false,
    portraitSaveDirectory: "modules/lorebridge/images",
    playerLoreEnabled: false,
    campaignCodexEnabled: true,
    npcTabProfileVisible: true,
    npcTabProfilePlayerHidden: true,
    npcTabRoleplayVisible: true,
    npcTabRoleplayPlayerHidden: true,
    npcTabKnowledgeVisible: true,
    npcTabKnowledgePlayerHidden: true,
    lorefolderPath: "lorebridge",
    portraitMatchRoot: "Artwork/Portraits/NPCs",
    playerCharacterNames: "",
    backupPathNpcs: "02-actors/npcs",
    backupPathPlayers: "02-actors/players",
    backupPathJournals: "07-foundry/journals",
    backupPathMacros: "07-foundry/macros",
    backupPathSessionLogs: "01-sessions",
    backupPathCcEntries: "07-foundry/cc-entries",
    backupPathCcFactions: "04-world/cc-factions",
    backupPathCcGroups: "04-world/cc-groups",
    backupPathCcLocations: "04-world/cc-locations",
    backupPathCcNpcs: "02-actors/cc-npcs",
    backupPathCcQuests: "03-quests/cc-quests",
    backupPathCcRegions: "04-world/cc-regions",
  });
});

test("falls back to provider none for unsupported values", () => {
  setGame({
    settings: {
      register() {},
      registerMenu() {},
      get(_moduleId: string, key: string) {
        if (key === LOREBRIDGE_SETTINGS.provider) return "unexpected-provider";
        return false;
      },
      async set() {
        return undefined;
      },
    },
  });

  assert.equal(getLoreBridgeSettings().provider, "none");
});
