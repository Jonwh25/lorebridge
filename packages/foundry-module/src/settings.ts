import { LoreBridgeSettingsApp } from "./settings-workspace.js";

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: new (...args: any[]) => unknown;
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
  combatWritesEnabled: "combatWritesEnabled",
  uiButtonsEnabled: "uiButtonsEnabled",
  chatCommandEnabled: "chatCommandEnabled",
  journalQaEnabled: "journalQaEnabled",
  npcMentionEnabled: "npcMentionEnabled",
  contextProfiles: "contextProfiles",
  activeContextProfileId: "activeContextProfileId",
  generationHistory: "generationHistory",
  maxHistoryLength: "maxHistoryLength",
  historySaveImages: "historySaveImages",
  portraitSaveDirectory: "portraitSaveDirectory",
  playerLoreEnabled: "playerLoreEnabled",
  playerLoreAllowlist: "playerLoreAllowlist",
  campaignCodexEnabled: "campaignCodexEnabled",
  npcTabProfileVisible: "npcTabProfileVisible",
  npcTabProfilePlayerHidden: "npcTabProfilePlayerHidden",
  npcTabRoleplayVisible: "npcTabRoleplayVisible",
  npcTabRoleplayPlayerHidden: "npcTabRoleplayPlayerHidden",
  npcTabKnowledgeVisible: "npcTabKnowledgeVisible",
  npcTabKnowledgePlayerHidden: "npcTabKnowledgePlayerHidden",
  lorefolderPath: "lorefolderPath",
  portraitMatchRoot: "portraitMatchRoot",
  playerCharacterNames: "playerCharacterNames",
  // Backup config — general
  backupPathNpcs: "backupPathNpcs",
  backupPathPlayers: "backupPathPlayers",
  backupPathJournals: "backupPathJournals",
  backupPathMacros: "backupPathMacros",
  backupPathSessionLogs: "backupPathSessionLogs",
  // Backup config — Campaign Codex
  backupPathCcEntries: "backupPathCcEntries",
  backupPathCcFactions: "backupPathCcFactions",
  backupPathCcGroups: "backupPathCcGroups",
  backupPathCcLocations: "backupPathCcLocations",
  backupPathCcNpcs: "backupPathCcNpcs",
  backupPathCcQuests: "backupPathCcQuests",
  backupPathCcRegions: "backupPathCcRegions",
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
  combatWritesEnabled: boolean;
  uiButtonsEnabled: boolean;
  chatCommandEnabled: boolean;
  journalQaEnabled: boolean;
  npcMentionEnabled: boolean;
  portraitSaveDirectory: string;
  playerLoreEnabled: boolean;
  campaignCodexEnabled: boolean;
  npcTabProfileVisible: boolean;
  npcTabProfilePlayerHidden: boolean;
  npcTabRoleplayVisible: boolean;
  npcTabRoleplayPlayerHidden: boolean;
  npcTabKnowledgeVisible: boolean;
  npcTabKnowledgePlayerHidden: boolean;
  lorefolderPath: string;
  portraitMatchRoot: string;
  playerCharacterNames: string;
  backupPathNpcs: string;
  backupPathPlayers: string;
  backupPathJournals: string;
  backupPathMacros: string;
  backupPathSessionLogs: string;
  backupPathCcEntries: string;
  backupPathCcFactions: string;
  backupPathCcGroups: string;
  backupPathCcLocations: string;
  backupPathCcNpcs: string;
  backupPathCcQuests: string;
  backupPathCcRegions: string;
};

export function registerLoreBridgeSettings(): void {
  const settings = getFoundrySettingsApi();

  settings.registerMenu(MODULE_ID, "workspace", {
    name: "LoreBridge Settings",
    label: "Open LoreBridge Settings",
    hint: "Configure connection, features, AI content, access controls, and generation history in one place.",
    icon: "fas fa-bridge",
    type: LoreBridgeSettingsApp,
    restricted: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.generationHistory, {
    name: "LoreBridge Generation History",
    hint: "JSON array of recent AI generation entries.",
    scope: "world",
    config: false,
    type: String,
    default: "[]",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.maxHistoryLength, {
    name: "Max Generation History Length",
    hint: "Maximum number of recent AI generations to keep. Oldest entries are pruned automatically.",
    scope: "world",
    config: false,
    type: Number,
    default: 10,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.historySaveImages, {
    name: "Save Generated Images to History",
    hint: "Include AI-generated portrait and token images in generation history entries.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
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
    config: false,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, {
    name: "Enable Remote AI Integration",
    hint: "Allow LoreBridge to connect to a configured backend service. No provider API keys are stored in Foundry.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.provider, {
    name: "Remote AI Provider",
    hint: "Select the provider used by the LoreBridge backend. This does not store provider credentials in Foundry.",
    scope: "world",
    config: false,
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
    config: false,
    type: String,
    default: "Session Logs",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.excludedCompendiums, {
    name: "Excluded Compendiums",
    hint: "Comma-separated list of compendium pack IDs to hide from LoreBridge (e.g. dnd5e.spells,world.private).",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.writesEnabled, {
    name: "Enable AI-Proposed Writes",
    hint: "Allow AI assistants to propose journal page updates. Each change requires explicit GM approval before any content is modified.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.combatWritesEnabled, {
    name: "Enable Controlled Combat Writes",
    hint: "Allow narrowly typed combat actions to be proposed. Every action requires fresh-state validation and explicit GM approval.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.uiButtonsEnabled, {
    name: "Enable Foundry UI Buttons",
    hint: "Show LoreBridge generation and suggestion buttons on supported sheets.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.chatCommandEnabled, {
    name: "Enable /lb Chat Command",
    hint: "Allow LoreBridge /lb questions, roleplay, city, and NPC commands in chat.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.journalQaEnabled, {
    name: "Enable Journal Page Q&A Panel",
    hint: "Show the Ask LoreBridge panel on journal sheets.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.npcMentionEnabled, {
    name: "Enable @NPC Mention Responses",
    hint: "Allow players and the GM to address AI-enabled NPCs in chat using @ActorName.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.portraitSaveDirectory, {
    name: "Portrait Save Directory",
    hint: "Directory (relative to Foundry's Data folder) where AI-generated portraits are saved. Example: Artwork/Portraits/LoreBridge",
    scope: "world",
    config: false,
    type: String,
    default: "modules/lorebridge/images",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.playerLoreEnabled, {
    name: "Enable Player Lore Assistant",
    hint: "Allow players to ask questions answered only from GM-published, player-visible journals using /lb ask. Disabled by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.playerLoreAllowlist, {
    name: "Player Lore Allowlist",
    hint: "JSON array of journal IDs published for player queries.",
    scope: "world",
    config: false,
    type: String,
    default: "[]",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.campaignCodexEnabled, {
    name: "Enable Campaign Codex NPC Dossier Widgets",
    hint: "Register LoreBridge NPC Dossier widgets with Campaign Codex and auto-add them to NPC journals. Requires reload.",
    scope: "world",
    config: false,
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

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabProfileVisible, {
    name: "NPC Profile Tab — Visible by Default",
    hint: "Show the Profile tab on Campaign Codex NPC sheets by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabProfilePlayerHidden, {
    name: "NPC Profile Tab — Player Hidden",
    hint: "Hide the Profile tab from players by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabRoleplayVisible, {
    name: "NPC Roleplaying Tab — Visible by Default",
    hint: "Show the Roleplaying tab on Campaign Codex NPC sheets by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabRoleplayPlayerHidden, {
    name: "NPC Roleplaying Tab — Player Hidden",
    hint: "Hide the Roleplaying tab from players by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabKnowledgeVisible, {
    name: "NPC Knowledge Tab — Visible by Default",
    hint: "Show the Knowledge tab on Campaign Codex NPC sheets by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabKnowledgePlayerHidden, {
    name: "NPC Knowledge Tab — Player Hidden",
    hint: "Hide the Knowledge tab from players by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.lorefolderPath, {
    name: "LoreBridge Data Folder",
    hint: "Subfolder name used by LoreBridge for tracking files (e.g. session tracker output). Relative to the Foundry Data directory.",
    scope: "world",
    config: false,
    type: String,
    default: "lorebridge",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.portraitMatchRoot, {
    name: "Portrait Match Root",
    hint: "Root folder to scan recursively for portrait images when matching portraits to NPC journals. Relative to the Foundry Data directory.",
    scope: "world",
    config: false,
    type: String,
    default: "Artwork/Portraits/NPCs",
  });

  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.playerCharacterNames, {
    name: "Player Character Names",
    hint: "Comma-separated list of player character names to exclude from NPC extraction (e.g. Jaylyn, Aldric, Mira).",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

  // Backup config — general
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathNpcs, {
    name: "Backup: Actors (NPCs) Folder",
    hint: "GitHub repo-root-relative folder for NPC actor backups.",
    scope: "world", config: false, type: String, default: "02-actors/npcs",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathPlayers, {
    name: "Backup: Actors (Players) Folder",
    hint: "GitHub repo-root-relative folder for player actor backups.",
    scope: "world", config: false, type: String, default: "02-actors/players",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathJournals, {
    name: "Backup: Journals Folder",
    hint: "GitHub repo-root-relative folder for journal backups.",
    scope: "world", config: false, type: String, default: "07-foundry/journals",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathMacros, {
    name: "Backup: Macros Folder",
    hint: "GitHub repo-root-relative folder for macro backups.",
    scope: "world", config: false, type: String, default: "07-foundry/macros",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathSessionLogs, {
    name: "Backup: Session Logs Folder",
    hint: "GitHub repo-root-relative folder for session log backups.",
    scope: "world", config: false, type: String, default: "01-sessions",
  });

  // Backup config — Campaign Codex
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcEntries, {
    name: "Backup: CC Entries Folder",
    hint: "GitHub repo-root-relative folder for Campaign Codex Entries backups.",
    scope: "world", config: false, type: String, default: "07-foundry/cc-entries",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcFactions, {
    name: "Backup: CC Factions Folder",
    hint: "GitHub repo-root-relative folder for Campaign Codex Factions backups.",
    scope: "world", config: false, type: String, default: "04-world/cc-factions",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcGroups, {
    name: "Backup: CC Groups Folder",
    hint: "GitHub repo-root-relative folder for Campaign Codex Groups backups.",
    scope: "world", config: false, type: String, default: "04-world/cc-groups",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcLocations, {
    name: "Backup: CC Locations Folder",
    hint: "GitHub repo-root-relative folder for Campaign Codex Locations backups.",
    scope: "world", config: false, type: String, default: "04-world/cc-locations",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcNpcs, {
    name: "Backup: CC NPCs Folder",
    hint: "GitHub repo-root-relative folder for Campaign Codex NPCs backups.",
    scope: "world", config: false, type: String, default: "02-actors/cc-npcs",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcQuests, {
    name: "Backup: CC Quests Folder",
    hint: "GitHub repo-root-relative folder for Campaign Codex Quests backups.",
    scope: "world", config: false, type: String, default: "03-quests/cc-quests",
  });
  settings.register(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcRegions, {
    name: "Backup: CC Regions Folder",
    hint: "GitHub repo-root-relative folder for Campaign Codex Regions backups.",
    scope: "world", config: false, type: String, default: "04-world/cc-regions",
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
    combatWritesEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.combatWritesEnabled),
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
    npcMentionEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.npcMentionEnabled),
    ),
    portraitSaveDirectory: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.portraitSaveDirectory) ?? "modules/lorebridge/images",
    ).trim(),
    playerLoreEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.playerLoreEnabled),
    ),
    campaignCodexEnabled: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.campaignCodexEnabled) ?? true,
    ),
    npcTabProfileVisible: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabProfileVisible) ?? true,
    ),
    npcTabProfilePlayerHidden: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabProfilePlayerHidden) ?? true,
    ),
    npcTabRoleplayVisible: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabRoleplayVisible) ?? true,
    ),
    npcTabRoleplayPlayerHidden: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabRoleplayPlayerHidden) ?? true,
    ),
    npcTabKnowledgeVisible: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabKnowledgeVisible) ?? true,
    ),
    npcTabKnowledgePlayerHidden: Boolean(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.npcTabKnowledgePlayerHidden) ?? true,
    ),
    lorefolderPath: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.lorefolderPath) ?? "lorebridge",
    ).trim(),
    portraitMatchRoot: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.portraitMatchRoot) ?? "Artwork/Portraits/NPCs",
    ).trim(),
    playerCharacterNames: String(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.playerCharacterNames) ?? "",
    ).trim(),
    backupPathNpcs: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathNpcs), "02-actors/npcs"),
    backupPathPlayers: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathPlayers), "02-actors/players"),
    backupPathJournals: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathJournals), "07-foundry/journals"),
    backupPathMacros: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathMacros), "07-foundry/macros"),
    backupPathSessionLogs: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathSessionLogs), "01-sessions"),
    backupPathCcEntries: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcEntries), "07-foundry/cc-entries"),
    backupPathCcFactions: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcFactions), "04-world/cc-factions"),
    backupPathCcGroups: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcGroups), "04-world/cc-groups"),
    backupPathCcLocations: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcLocations), "04-world/cc-locations"),
    backupPathCcNpcs: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcNpcs), "02-actors/cc-npcs"),
    backupPathCcQuests: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcQuests), "03-quests/cc-quests"),
    backupPathCcRegions: normalizeBackupPath(
      settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.backupPathCcRegions), "04-world/cc-regions"),
  };
}

function normalizeProvider(value: unknown): LoreBridgeProvider {
  if (value === "openai") return "openai";
  if (value === "anthropic") return "anthropic";
  return "none";
}

function normalizeBackupPath(value: unknown, defaultValue: string): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("/") || raw.includes("..")) return defaultValue;
  return raw;
}
