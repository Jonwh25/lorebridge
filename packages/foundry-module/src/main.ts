import {
  GET_ACTOR_CAPABILITY,
  GET_ACTOR_DECLARATION,
  GET_JOURNAL_CAPABILITY,
  GET_JOURNAL_DECLARATION,
  GET_JOURNAL_PAGE_CAPABILITY,
  GET_JOURNAL_PAGE_DECLARATION,
  GET_SCENE_CAPABILITY,
  GET_SCENE_DECLARATION,
  GET_ACTIVE_SCENE_CAPABILITY,
  GET_ACTIVE_SCENE_DECLARATION,
  GET_COMBAT_STATE_CAPABILITY,
  GET_COMBAT_STATE_DECLARATION,
  ROLL_DICE_CAPABILITY,
  ROLL_DICE_DECLARATION,
  GET_CHAT_MESSAGES_CAPABILITY,
  GET_CHAT_MESSAGES_DECLARATION,
  SEARCH_ASSETS_CAPABILITY, SEARCH_ASSETS_DECLARATION,
  GET_WORLD_SUMMARY_CAPABILITY,
  GET_WORLD_SUMMARY_DECLARATION,
  GET_RELATED_DOCUMENTS_CAPABILITY,
  GET_RELATED_DOCUMENTS_DECLARATION,
  RESOLVE_UUID_CAPABILITY,
  RESOLVE_UUID_DECLARATION,
  SEARCH_ACTORS_CAPABILITY,
  SEARCH_ACTORS_DECLARATION,
  SEARCH_CAMPAIGN_CAPABILITY,
  SEARCH_CAMPAIGN_DECLARATION,
  SEARCH_ITEMS_CAPABILITY,
  SEARCH_ITEMS_DECLARATION,
  GET_ACTOR_INVENTORY_CAPABILITY,
  GET_ACTOR_INVENTORY_DECLARATION,
  SEARCH_SESSION_LOGS_CAPABILITY,
  SEARCH_SESSION_LOGS_DECLARATION,
  GET_SESSION_LOG_CAPABILITY,
  GET_SESSION_LOG_DECLARATION,
  LIST_COMPENDIUMS_CAPABILITY,
  LIST_COMPENDIUMS_DECLARATION,
  SEARCH_COMPENDIUM_CAPABILITY,
  SEARCH_COMPENDIUM_DECLARATION,
  GET_COMPENDIUM_ENTRY_CAPABILITY,
  GET_COMPENDIUM_ENTRY_DECLARATION,
  SEARCH_JOURNALS_CAPABILITY,
  SEARCH_JOURNALS_DECLARATION,
  SEARCH_SCENES_CAPABILITY,
  SEARCH_SCENES_DECLARATION,
  LIST_MACRO_TOOLS_CAPABILITY,
  LIST_MACRO_TOOLS_DECLARATION,
  EXECUTE_MACRO_TOOL_CAPABILITY,
  EXECUTE_MACRO_TOOL_DECLARATION,
} from "@lorebridge/shared/capabilities";
import { LOREBRIDGE_EVENTS, LOREBRIDGE_PROTOCOL_VERSION } from "@lorebridge/shared";

import { getWorldSummary } from "./capabilities/get-world-summary.js";
import { getJournal, getJournalPage, searchJournals } from "./capabilities/journals.js";
import { getActor, searchActors } from "./capabilities/actors.js";
import { getActiveScene, getScene, searchScenes } from "./capabilities/scenes.js";
import { getCombatState } from "./capabilities/combat.js";
import { rollDice } from "./capabilities/dice.js";
import { getChatMessages } from "./capabilities/chat.js";
import { searchAssets } from "./capabilities/assets.js";
import { resolveUuid } from "./capabilities/resolve-uuid.js";
import { searchCampaign } from "./capabilities/search-campaign.js";
import { getRelatedDocuments } from "./capabilities/related-documents.js";
import { searchItems, getActorInventory } from "./capabilities/items.js";
import { searchSessionLogs, getSessionLog } from "./capabilities/session-logs.js";
import { listCompendiums, searchCompendium, getCompendiumEntry } from "./capabilities/compendium.js";
import { approveWrite, rejectWrite, showWriteApprovalChat, showRollTableApprovalChat, type WriteApprovalPayload, type RollTableApprovalPayload } from "./capabilities/writes.js";
import { listMacroTools, executeMacroTool } from "./capabilities/macro-tools.js";
import { generateBoxedText } from "./capabilities/generate-boxed-text.js";
import { registerChatCommand } from "./capabilities/ui-chat.js";
import { registerSheetButtons } from "./capabilities/ui-sheets.js";
import { shouldExposeCapabilityApi } from "./runtime-policy.js";
import {
  getLoreBridgeSettings,
  registerFeatureSettingsPresentation,
  registerLoreBridgeSettings
} from "./settings.js";
import { LoreBridgeAdapterTransport } from "./adapter-transport.js";
import { LoreBridgeCapabilityError } from "./capabilities/errors.js";

const MODULE_ID = "lorebridge";
const MODULE_LABEL = "LoreBridge";
let adapterTransport: LoreBridgeAdapterTransport | undefined;

type FoundryModuleMetadata = {
  version?: string;
};

function getModuleVersion(): string {
  const moduleMetadata = game.modules.get(MODULE_ID) as FoundryModuleMetadata | undefined;
  return moduleMetadata?.version ?? "unknown";
}

Hooks.once("init", () => {
  registerLoreBridgeSettings();
  registerFeatureSettingsPresentation();
  registerChatCommand();
  registerSheetButtons();

  console.info(
    `${MODULE_LABEL} | Initializing ${MODULE_LABEL} ${getModuleVersion()} (protocol ${LOREBRIDGE_PROTOCOL_VERSION})`
  );
});

Hooks.once("ready", () => {
  const settings = getLoreBridgeSettings();
  const isGM = Boolean(game.user?.isGM);

  if (!shouldExposeCapabilityApi(isGM, settings)) {
    if (!isGM) {
      console.info(`${MODULE_LABEL} | Capability API unavailable to non-GM user ${game.user?.name ?? "unknown"}`);
    } else {
      console.info(`${MODULE_LABEL} | Capability API disabled in world settings`);
    }
    return;
  }

  if (settings.remoteIntegrationEnabled) {
    if (!settings.backendUrl) {
      ui.notifications.warn("LoreBridge remote integration is enabled, but no backend URL is configured.");
    } else if (!settings.clientToken) {
      ui.notifications.warn("LoreBridge remote integration is enabled, but this browser is not paired.");
    } else {
      const registration = {
        adapterId: "foundry-vtt",
        adapterType: "foundry",
        adapterVersion: getModuleVersion(),
        protocolVersions: [LOREBRIDGE_PROTOCOL_VERSION],
        sources: [{
          sourceId: `foundry:${game.world?.id ?? "unknown"}`,
          adapterId: "foundry-vtt",
          sourceType: "foundry-world",
          name: game.world?.title ?? "Unknown Foundry World",
        }],
        capabilities: [
          GET_WORLD_SUMMARY_DECLARATION,
          SEARCH_JOURNALS_DECLARATION,
          GET_JOURNAL_DECLARATION,
          GET_JOURNAL_PAGE_DECLARATION,
          SEARCH_ACTORS_DECLARATION,
          GET_ACTOR_DECLARATION,
          SEARCH_SCENES_DECLARATION,
          GET_SCENE_DECLARATION,
          GET_ACTIVE_SCENE_DECLARATION,
          GET_COMBAT_STATE_DECLARATION,
          ROLL_DICE_DECLARATION,
          GET_CHAT_MESSAGES_DECLARATION,
          SEARCH_ASSETS_DECLARATION,
          RESOLVE_UUID_DECLARATION,
          SEARCH_CAMPAIGN_DECLARATION,
          GET_RELATED_DOCUMENTS_DECLARATION,
          SEARCH_ITEMS_DECLARATION,
          GET_ACTOR_INVENTORY_DECLARATION,
          SEARCH_SESSION_LOGS_DECLARATION,
          GET_SESSION_LOG_DECLARATION,
          LIST_COMPENDIUMS_DECLARATION,
          SEARCH_COMPENDIUM_DECLARATION,
          GET_COMPENDIUM_ENTRY_DECLARATION,
          LIST_MACRO_TOOLS_DECLARATION,
          EXECUTE_MACRO_TOOL_DECLARATION,
        ],
      };
      adapterTransport = new LoreBridgeAdapterTransport(
        settings.backendUrl,
        settings.clientToken,
        registration,
        (request) => {
          if (request.sourceId !== registration.sources[0]?.sourceId) {
            throw new LoreBridgeCapabilityError(
              "NOT_FOUND",
              `Foundry source ${request.sourceId} is not available.`,
            );
          }
          if (request.capability === GET_WORLD_SUMMARY_CAPABILITY) {
            if (
              typeof request.input !== "object"
              || request.input === null
              || Array.isArray(request.input)
              || Object.keys(request.input).length > 0
            ) {
              throw new LoreBridgeCapabilityError(
                "INVALID_REQUEST",
                "getWorldSummary input must be an empty object.",
              );
            }
            return getWorldSummary();
          }
          if (request.capability === SEARCH_JOURNALS_CAPABILITY) {
            return searchJournals(request.input as Parameters<typeof searchJournals>[0]);
          }
          if (request.capability === GET_JOURNAL_PAGE_CAPABILITY) {
            return getJournalPage(request.input as Parameters<typeof getJournalPage>[0]);
          }
          if (request.capability === SEARCH_ACTORS_CAPABILITY) {
            return searchActors(request.input as Parameters<typeof searchActors>[0]);
          }
          if (request.capability === GET_ACTOR_CAPABILITY) {
            return getActor(request.input as Parameters<typeof getActor>[0]);
          }
          if (request.capability === SEARCH_SCENES_CAPABILITY) {
            return searchScenes(request.input as Parameters<typeof searchScenes>[0]);
          }
          if (request.capability === GET_SCENE_CAPABILITY) {
            return getScene(request.input as Parameters<typeof getScene>[0]);
          }
          if (request.capability === GET_ACTIVE_SCENE_CAPABILITY) {
            return getActiveScene(request.input as Parameters<typeof getActiveScene>[0]);
          }
          if (request.capability === GET_COMBAT_STATE_CAPABILITY) {
            return getCombatState(request.input as Parameters<typeof getCombatState>[0]);
          }
          if (request.capability === ROLL_DICE_CAPABILITY) {
            return rollDice(request.input as Parameters<typeof rollDice>[0]);
          }
          if (request.capability === GET_CHAT_MESSAGES_CAPABILITY) return getChatMessages(request.input as Parameters<typeof getChatMessages>[0]);
          if (request.capability === SEARCH_ASSETS_CAPABILITY) return searchAssets(request.input as Parameters<typeof searchAssets>[0]);
          if (request.capability === RESOLVE_UUID_CAPABILITY) {
            return resolveUuid(request.input as Parameters<typeof resolveUuid>[0]);
          }
          if (request.capability === SEARCH_CAMPAIGN_CAPABILITY) {
            return searchCampaign(request.input as Parameters<typeof searchCampaign>[0]);
          }
          if (request.capability === GET_RELATED_DOCUMENTS_CAPABILITY) {
            return getRelatedDocuments(request.input as Parameters<typeof getRelatedDocuments>[0]);
          }
          if (request.capability === SEARCH_ITEMS_CAPABILITY) {
            return searchItems(request.input as Parameters<typeof searchItems>[0]);
          }
          if (request.capability === GET_ACTOR_INVENTORY_CAPABILITY) {
            return getActorInventory(request.input as Parameters<typeof getActorInventory>[0]);
          }
          if (request.capability === SEARCH_SESSION_LOGS_CAPABILITY) {
            return searchSessionLogs(request.input as Parameters<typeof searchSessionLogs>[0]);
          }
          if (request.capability === GET_SESSION_LOG_CAPABILITY) {
            return getSessionLog(request.input as Parameters<typeof getSessionLog>[0]);
          }
          if (request.capability === LIST_COMPENDIUMS_CAPABILITY) {
            return listCompendiums(request.input as Parameters<typeof listCompendiums>[0]);
          }
          if (request.capability === SEARCH_COMPENDIUM_CAPABILITY) {
            return searchCompendium(request.input as Parameters<typeof searchCompendium>[0]);
          }
          if (request.capability === GET_COMPENDIUM_ENTRY_CAPABILITY) {
            return getCompendiumEntry(request.input as Parameters<typeof getCompendiumEntry>[0]);
          }
          if (request.capability === LIST_MACRO_TOOLS_CAPABILITY) {
            const { tools } = listMacroTools();
            return {
              sourceId: registration.sources[0]?.sourceId ?? "foundry:unknown",
              sourceName: game.world?.title ?? "Unknown World",
              tools,
            };
          }
          if (request.capability === EXECUTE_MACRO_TOOL_CAPABILITY) {
            const input = request.input as { toolName: string; args?: Record<string, unknown> };
            return executeMacroTool(input.toolName, input.args ?? {}).then(({ macroName, result }) => ({
              sourceId: registration.sources[0]?.sourceId ?? "foundry:unknown",
              sourceName: game.world?.title ?? "Unknown World",
              toolName: input.toolName,
              macroName,
              result,
            }));
          }
          throw new LoreBridgeCapabilityError(
            "CAPABILITY_UNAVAILABLE",
            `Foundry capability ${request.capability} is not remotely available.`,
          );
        },
        undefined,
        (event) => {
          if (event.event === LOREBRIDGE_EVENTS.approvalRequired) {
            void showWriteApprovalChat(event.payload as WriteApprovalPayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.rollTableApprovalRequired) {
            void showRollTableApprovalChat(event.payload as RollTableApprovalPayload);
          }
        },
      );

      void adapterTransport.connect().then((state) => {
        if (state.state === "connected") {
          console.info(`${MODULE_LABEL} | Connected to backend ${state.backendId}`, {
            sessionId: state.sessionId,
            sourceId: registration.sources[0]?.sourceId,
          });
          console.info(`${MODULE_LABEL} | Connected to the backend.`);
        } else if (state.state === "error") {
          console.error(`${MODULE_LABEL} | Backend connection failed: ${state.message}`);
          ui.notifications.error(`LoreBridge backend connection failed: ${state.message}`);
        }
      });
    }
  }

  const moduleVersion = getModuleVersion();
  const summary = getWorldSummary();

  console.info(`${MODULE_LABEL} | GM bridge ready`, {
    moduleVersion,
    protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
    settings: {
      capabilityApiEnabled: settings.capabilityApiEnabled,
      remoteIntegrationEnabled: settings.remoteIntegrationEnabled,
      provider: settings.provider,
      backendConfigured: Boolean(settings.backendUrl),
      paired: Boolean(settings.clientToken)
    },
    summary,
    capabilities: [GET_WORLD_SUMMARY_DECLARATION, SEARCH_JOURNALS_DECLARATION, GET_JOURNAL_DECLARATION, GET_JOURNAL_PAGE_DECLARATION, SEARCH_ACTORS_DECLARATION, GET_ACTOR_DECLARATION, SEARCH_SCENES_DECLARATION, GET_SCENE_DECLARATION, GET_ACTIVE_SCENE_DECLARATION, GET_COMBAT_STATE_DECLARATION, ROLL_DICE_DECLARATION, RESOLVE_UUID_DECLARATION, SEARCH_CAMPAIGN_DECLARATION, GET_RELATED_DOCUMENTS_DECLARATION, SEARCH_ITEMS_DECLARATION, GET_ACTOR_INVENTORY_DECLARATION, SEARCH_SESSION_LOGS_DECLARATION, GET_SESSION_LOG_DECLARATION, LIST_COMPENDIUMS_DECLARATION, SEARCH_COMPENDIUM_DECLARATION, GET_COMPENDIUM_ENTRY_DECLARATION]
  });
  console.info(`${MODULE_LABEL} | Ready for ${summary.world.title}.`);

  // Temporary local development API. It exposes only explicitly approved,
  // typed capabilities and will be replaced by an authenticated dispatcher.
  Object.defineProperty(globalThis, "LoreBridge", {
    value: Object.freeze({
      version: moduleVersion,
      moduleVersion,
      protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
      capabilities: Object.freeze([GET_WORLD_SUMMARY_DECLARATION, SEARCH_JOURNALS_DECLARATION, GET_JOURNAL_DECLARATION, GET_JOURNAL_PAGE_DECLARATION, SEARCH_ACTORS_DECLARATION, GET_ACTOR_DECLARATION, SEARCH_SCENES_DECLARATION, GET_SCENE_DECLARATION, GET_ACTIVE_SCENE_DECLARATION, GET_COMBAT_STATE_DECLARATION, ROLL_DICE_DECLARATION, RESOLVE_UUID_DECLARATION, SEARCH_CAMPAIGN_DECLARATION, GET_RELATED_DOCUMENTS_DECLARATION, SEARCH_ITEMS_DECLARATION, GET_ACTOR_INVENTORY_DECLARATION, SEARCH_SESSION_LOGS_DECLARATION, GET_SESSION_LOG_DECLARATION, LIST_COMPENDIUMS_DECLARATION, SEARCH_COMPENDIUM_DECLARATION, GET_COMPENDIUM_ENTRY_DECLARATION]),
      settings: Object.freeze({
        capabilityApiEnabled: settings.capabilityApiEnabled,
        remoteIntegrationEnabled: settings.remoteIntegrationEnabled,
        provider: settings.provider,
        backendUrl: settings.backendUrl ? "configured" : "",
        paired: Boolean(settings.clientToken)
      }),
      getConnectionStatus: () => adapterTransport?.state ?? { state: "disconnected" },
      [GET_WORLD_SUMMARY_CAPABILITY]: getWorldSummary,
      [SEARCH_JOURNALS_CAPABILITY]: searchJournals,
      [GET_JOURNAL_CAPABILITY]: getJournal,
      [GET_JOURNAL_PAGE_CAPABILITY]: getJournalPage,
      [SEARCH_ACTORS_CAPABILITY]: searchActors,
      [GET_ACTOR_CAPABILITY]: getActor,
      [SEARCH_SCENES_CAPABILITY]: searchScenes,
      [GET_SCENE_CAPABILITY]: getScene,
      [GET_ACTIVE_SCENE_CAPABILITY]: getActiveScene,
      [GET_COMBAT_STATE_CAPABILITY]: getCombatState,
      [ROLL_DICE_CAPABILITY]: rollDice,
      [GET_CHAT_MESSAGES_CAPABILITY]: getChatMessages,
      [SEARCH_ASSETS_CAPABILITY]: searchAssets,
      [RESOLVE_UUID_CAPABILITY]: resolveUuid,
      [SEARCH_CAMPAIGN_CAPABILITY]: searchCampaign,
      [GET_RELATED_DOCUMENTS_CAPABILITY]: getRelatedDocuments,
      [SEARCH_ITEMS_CAPABILITY]: searchItems,
      [GET_ACTOR_INVENTORY_CAPABILITY]: getActorInventory,
      [SEARCH_SESSION_LOGS_CAPABILITY]: searchSessionLogs,
      [GET_SESSION_LOG_CAPABILITY]: getSessionLog,
      [LIST_COMPENDIUMS_CAPABILITY]: listCompendiums,
      [SEARCH_COMPENDIUM_CAPABILITY]: searchCompendium,
      [GET_COMPENDIUM_ENTRY_CAPABILITY]: getCompendiumEntry,
      approveWrite,
      rejectWrite,
      generateBoxedText,
    }),
    configurable: true,
    writable: false
  });
});
