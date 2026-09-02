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
  EXECUTE_COMBAT_WRITE_CAPABILITY,
  EXECUTE_COMBAT_WRITE_DECLARATION,
  PROPOSE_COMBAT_WRITE_CAPABILITY,
  PROPOSE_COMBAT_WRITE_DECLARATION,
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
  LIST_MACROS_CAPABILITY,
  LIST_MACROS_DECLARATION,
  CHECK_CAMPAIGN_HEALTH_CAPABILITY,
  CHECK_CAMPAIGN_HEALTH_DECLARATION,
  AUDIT_CAMPAIGN_CONSISTENCY_CAPABILITY,
  AUDIT_CAMPAIGN_CONSISTENCY_DECLARATION,
  SEARCH_ROLL_TABLES_CAPABILITY,
  SEARCH_ROLL_TABLES_DECLARATION,
  LIST_PLAYLISTS_CAPABILITY,
  LIST_PLAYLISTS_DECLARATION,
  SEARCH_PLAYLISTS_CAPABILITY,
  SEARCH_PLAYLISTS_DECLARATION,
  GET_QUEST_OBJECTIVES_CAPABILITY,
  GET_QUEST_OBJECTIVES_DECLARATION,
} from "@lorebridge/shared/capabilities";
import { LOREBRIDGE_EVENTS, LOREBRIDGE_PROTOCOL_VERSION } from "@lorebridge/shared";

import { getWorldSummary } from "./capabilities/get-world-summary.js";
import { getJournal, getJournalPage, searchJournals } from "./capabilities/journals.js";
import { getActor, searchActors } from "./capabilities/actors.js";
import { getActiveScene, getScene, searchScenes } from "./capabilities/scenes.js";
import { getCombatState } from "./capabilities/combat.js";
import { approveCombatWrite, executeCombatWrite, proposeCombatWrite, proposeCombatWriteTest, rejectCombatWrite, showCombatWriteApproval } from "./capabilities/combat-writes.js";
import type { CombatWriteApprovalPayload, ExecuteCombatWriteInput, ProposeCombatWriteInput } from "@lorebridge/shared/capabilities";
import { rollDice } from "./capabilities/dice.js";
import { getChatMessages } from "./capabilities/chat.js";
import { searchAssets } from "./capabilities/assets.js";
import { resolveUuid } from "./capabilities/resolve-uuid.js";
import { searchCampaign } from "./capabilities/search-campaign.js";
import { getRelatedDocuments } from "./capabilities/related-documents.js";
import { searchItems, getActorInventory } from "./capabilities/items.js";
import { searchSessionLogs, getSessionLog } from "./capabilities/session-logs.js";
import { listCompendiums, searchCompendium, getCompendiumEntry } from "./capabilities/compendium.js";
import { approveWrite, rejectWrite, rollbackWrite, showWriteApprovalChat, showRollTableApprovalChat, showRollbackAvailableChat, registerRollbackChatHook, type WriteApprovalPayload, type RollTableApprovalPayload } from "./capabilities/writes.js";
import type { RollbackAvailablePayload } from "@lorebridge/shared/capabilities";
import { listMacros, listMacroTools, executeMacroTool } from "./capabilities/macro-tools.js";
import { generateBoxedText } from "./capabilities/generate-boxed-text.js";
import { checkCampaignHealth } from "./capabilities/health-check.js";
import { auditCampaignConsistency } from "./capabilities/consistency-audit.js";
import { searchRollTables } from "./capabilities/roll-tables.js";
import { showActorCreateApprovalDialog, showActorUpdateApprovalDialog } from "./capabilities/actor-writes.js";
import { showItemCreateApprovalDialog, showItemUpdateApprovalDialog } from "./capabilities/item-writes.js";
import { showEncounterCreateApprovalDialog, showSceneUpdateApprovalDialog } from "./capabilities/encounter-writes.js";
import type { ActorCreateApprovalPayload, ActorUpdateApprovalPayload, ItemCreateApprovalPayload, ItemUpdateApprovalPayload, EncounterCreateApprovalPayload, SceneUpdateApprovalPayload } from "@lorebridge/shared/capabilities";
import { listPlaylists, searchPlaylists } from "./capabilities/playlists.js";
import { getQuestObjectives, showQuestObjectivesApprovalChat, approveQuestObjectivesWrite, rejectQuestObjectivesWrite, type QuestObjectivesApprovalPayload } from "./capabilities/quest-objectives.js";
import { registerChatCommand } from "./capabilities/ui-chat.js";
import { registerPlayerLoreSocketListener } from "./capabilities/player-lore.js";
import { registerNpcMentionHook, registerNpcPreambleSheetHook } from "./capabilities/npc-mention.js";
import { registerPortraitMenuHook } from "./capabilities/image-generation.js";
import { registerNpcWorkspaceMenuHook, registerNpcProfileSheetSection } from "./capabilities/npc-workspace.js";
import { registerCampaignCodexWidget } from "./capabilities/campaign-codex-widget.js";
import { registerHotbarDistributeListener, registerSidebarHooks, openBulkCreateDialog, openHotbarDistributeDialog } from "./capabilities/session-tools.js";
import { registerPlayerActorImportSheetHook } from "./capabilities/player-actor-import.js";
import { registerSheetButtons } from "./capabilities/ui-sheets.js";
import { showNpcStatBlockDialog } from "./capabilities/npc-statblock.js";
import { openSessionCommandCenter } from "./session-command-center.js";
import { shouldExposeCapabilityApi } from "./runtime-policy.js";
import {
  getLoreBridgeSettings,
  registerLoreBridgeSettings
} from "./settings.js";
import { LoreBridgeAdapterTransport } from "./adapter-transport.js";
import { LoreBridgeCapabilityError } from "./capabilities/errors.js";

const MODULE_ID = "lorebridge";
const MODULE_LABEL = "LoreBridge";
let adapterTransport: LoreBridgeAdapterTransport | undefined;

function controlledCombatWriteDeclarations(enabled: boolean) {
  return enabled ? [PROPOSE_COMBAT_WRITE_DECLARATION, EXECUTE_COMBAT_WRITE_DECLARATION] : [];
}

type FoundryModuleMetadata = {
  version?: string;
};

function getModuleVersion(): string {
  const moduleMetadata = game.modules.get(MODULE_ID) as FoundryModuleMetadata | undefined;
  return moduleMetadata?.version ?? "unknown";
}

function injectCreateActorTypeOptions(frame: HTMLElement): void {
  // Detect the Create Actor dialog by its window title.
  const titleEl = frame.querySelector(".window-title, header .title, .app-title");
  const title = titleEl?.textContent?.toLowerCase() ?? "";
  if (!title.includes("create actor") && !title.includes("new actor")) return;

  // Guard against double-injection.
  if (frame.querySelector(".lb-create-actor-injected")) return;

  // Find the <ol> that holds the type radio buttons.
  const typeList = frame.querySelector<HTMLElement>("ol");

  const customOptions: Array<{ value: string; label: string; icon: string }> = [
    { value: "lb-statblock",   label: "AI NPC",       icon: "fas fa-dragon" },
    { value: "lb-bulk-create", label: "Player Party", icon: "fas fa-users"  },
  ];

  // Clone the first native <li> so our items inherit exact structure and CSS classes.
  // dnd5e structure: <li><label><dnd5e-icon/><span>text</span><input radio></label></li>
  // Generic Foundry: <li><input radio><label for="..."><i></i>text</label></li>
  const templateLi = typeList?.querySelector<HTMLElement>("li") ?? null;

  if (typeList && templateLi) {
    for (const opt of customOptions) {
      const li = templateLi.cloneNode(true) as HTMLElement;
      li.classList.add("lb-create-actor-injected");
      li.removeAttribute("data-tooltip");

      // Update radio input value and clear checked state.
      const radio = li.querySelector<HTMLInputElement>("input[type='radio']");
      if (radio) {
        radio.value = opt.value;
        radio.removeAttribute("checked");
        radio.checked = false;
        if (radio.id) {
          const newId = `actor-type-${opt.value}`;
          const linkedLabel = li.querySelector<HTMLLabelElement>(`label[for="${radio.id}"]`);
          if (linkedLabel) linkedLabel.htmlFor = newId;
          radio.id = newId;
        }
      }

      // Replace dnd5e-icon web component with a standard <i> element (same 32×32 box).
      const dnd5eIcon = li.querySelector("dnd5e-icon");
      if (dnd5eIcon) {
        const i = document.createElement("i");
        i.className = opt.icon;
        i.style.cssText = "display:block;width:32px;height:32px;font-size:22px;line-height:32px;text-align:center;flex-shrink:0;";
        dnd5eIcon.replaceWith(i);
      } else {
        const iconEl = li.querySelector("i");
        if (iconEl) iconEl.className = opt.icon;
      }

      // Update label text: try <span> first (dnd5e), then text nodes (generic Foundry).
      const span = li.querySelector("label span, span");
      if (span) {
        span.textContent = opt.label;
      } else {
        const label = li.querySelector("label");
        if (label) {
          for (const node of Array.from(label.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
              node.textContent = ` ${opt.label}`;
              break;
            }
          }
        }
      }

      typeList.appendChild(li);
    }
  } else {
    // Fallback: two side-by-side buttons above the form footer.
    const footer = frame.querySelector<HTMLElement>(".form-footer, footer, .dialog-buttons");
    if (!footer) return;
    const wrapper = document.createElement("div");
    wrapper.classList.add("lb-create-actor-injected");
    wrapper.style.cssText = "display:flex;gap:4px;margin-bottom:6px;";
    for (const opt of customOptions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.cssText = "flex:1;";
      btn.innerHTML = `<i class="${opt.icon}"></i> ${opt.label}`;
      btn.addEventListener("click", () => {
        if (opt.value === "lb-statblock") void showNpcStatBlockDialog();
        else void openBulkCreateDialog();
      });
      wrapper.appendChild(btn);
    }
    footer.insertAdjacentElement("beforebegin", wrapper);
    return;
  }

  // Intercept form submit (capture phase) to route custom type values.
  // Works for both type="submit" buttons and ApplicationV2 programmatic submit.
  const form = frame.querySelector("form") ?? frame.closest("form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    const selectedRadio = form.querySelector<HTMLInputElement>("input[type='radio'][name='type']:checked");
    const value = selectedRadio?.value;
    if (value !== "lb-statblock" && value !== "lb-bulk-create") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (value === "lb-statblock") void showNpcStatBlockDialog();
    else void openBulkCreateDialog();
  }, true);
}

function _injectSceneControlButton(frame: HTMLElement): void {
  if (frame.querySelector("[data-control='lorebridge']")) return;
  // Foundry v14 uses <menu data-application-part="layers">; older versions used
  // <ol class="main-controls"> or <ol class="controls">.
  const list = (
    frame.querySelector("menu[data-application-part='layers']") ??
    frame.querySelector(".main-controls") ??
    frame.querySelector("ol.controls") ??
    frame.querySelector("menu") ??
    frame.querySelector("ol")
  ) as HTMLElement | null;
  if (!list) return;

  const li = document.createElement("li");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.control = "lorebridge";
  btn.dataset.action = "activateControl";
  // v14: icon is expressed as classes on the button itself (no inner <i>).
  // Older Foundry: scene-control class + inner <i> tag.
  btn.classList.add("control", "ui-control", "layer", "icon", "fa-solid", "fa-bridge");
  btn.title = "LoreBridge Session Center";
  btn.setAttribute("aria-label", "LoreBridge Session Center");

  li.appendChild(btn);
  list.appendChild(li);
}

function _injectMacroSidebarButton(frame: HTMLElement): void {
  if (frame.querySelector(".lb-hotbar-distribute-btn")) return;

  const footer = (
    frame.querySelector(".directory-footer") ??
    frame.querySelector("footer") ??
    frame.querySelector("section footer")
  ) as HTMLElement | null;
  if (!footer) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("action-buttons", "flexcol", "lb-hotbar-distribute-btn");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = '<i class="fas fa-share"></i> Distribute Hotbar to Players';
  btn.addEventListener("click", () => { void openHotbarDistributeDialog(); });
  wrapper.appendChild(btn);
  footer.appendChild(wrapper);
}

Hooks.once("init", () => {
  registerLoreBridgeSettings();
  registerChatCommand();
  registerSheetButtons();
  registerRollbackChatHook();
  registerNpcMentionHook();
  Hooks.on("renderApplicationV2", (app: unknown) => {
    if (!game.user?.isGM) return;
    const appObj = app as { element?: HTMLElement; constructor?: { name?: string } };
    const frame = appObj.element;
    if (!frame) return;
    // Defer so dnd5e can finish populating <li> items into the type <ol>
    // before we try to clone them (they are added in a post-render step).
    setTimeout(() => { injectCreateActorTypeOptions(frame); }, 0);
    // MacroDirectory injection via constructor name (covers ApplicationV2 path).
    const appName = appObj.constructor?.name ?? "";
    if (appName === "MacroDirectory" || appName === "Macros") {
      _injectMacroSidebarButton(frame);
    }
    // SceneControls injection: injecting via DOM avoids adding LoreBridge to
    // ui.controls.controls, which breaks Material Deck's getTools() iteration
    // (its Helpers.sort returns undefined for empty arrays, crashing Material Deck init).
    if (game.user?.isGM && appName === "SceneControls") {
      _injectSceneControlButton(frame);
    }
  });
  // Register renderMacroDirectory here (init) so we catch the initial
  // sidebar render, which fires before the ready hook runs.
  Hooks.on("renderMacroDirectory", (...args: unknown[]) => {
    if (!game.user?.isGM) return;
    const html = args[1];
    const root = html instanceof HTMLElement ? html
      : (html as { get?(i: number): HTMLElement } | null)?.get?.(0)
      ?? (args[0] as { element?: HTMLElement }).element
      ?? null;
    if (root instanceof HTMLElement) _injectMacroSidebarButton(root);
  });
  registerNpcPreambleSheetHook();
  registerPortraitMenuHook();
  registerNpcWorkspaceMenuHook();
  registerNpcProfileSheetSection();

  // Register click listener for the LoreBridge scene controls button.
  // The button is injected directly into the SceneControls DOM via renderApplicationV2
  // rather than registered through getSceneControlButtons. Registering via
  // getSceneControlButtons adds LoreBridge to ui.controls.controls with tools:{},
  // which causes Material Deck's Helpers.sort([]) to return undefined and crash
  // Material Deck's initialization.
  document.addEventListener("click", (event) => {
    if (!game.user?.isGM) return;
    const btn = (event.target as Element | null)?.closest?.("[data-control='lorebridge']");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSessionCommandCenter();
  }, true);

  console.info(
    `${MODULE_LABEL} | Initializing ${MODULE_LABEL} ${getModuleVersion()} (protocol ${LOREBRIDGE_PROTOCOL_VERSION})`
  );
});

Hooks.once("ready", () => {
  // Register the player lore socket listener for all users so players can route
  // questions to the GM's browser via the module socket channel.
  registerPlayerLoreSocketListener();

  // Register hotbar distribution socket listener for all users so players
  // receive and apply GM hotbar broadcasts (#231).
  registerHotbarDistributeListener();

  // Register sidebar injection hooks (Macro Directory hotbar).
  registerSidebarHooks();

  // Inject directly into the already-rendered Macro sidebar.
  // Try ui.macros.element first, then a direct DOM query as fallback.
  if (game.user?.isGM) {
    const macrosEl = (
      (ui as unknown as { macros?: { element?: HTMLElement } }).macros?.element
      ?? document.querySelector<HTMLElement>("#macros, .sidebar-tab.macros, section[data-tab='macros']")
    );
    if (macrosEl) _injectMacroSidebarButton(macrosEl);
  }

  // Inject the SceneControls button if renderApplicationV2 did not catch it
  // (e.g. the SceneControls class name changed or the hook fired before the
  // module was ready). Injecting directly via DOM keeps us out of
  // ui.controls.controls so Material Deck is not affected.
  if (game.user?.isGM && !document.querySelector("[data-control='lorebridge']")) {
    const controlsFrame = (
      (ui as unknown as { controls?: { element?: HTMLElement } }).controls?.element
      ?? document.querySelector<HTMLElement>("#scene-controls, #controls, .controls-bar, nav.controls")
    );
    if (controlsFrame) _injectSceneControlButton(controlsFrame);
  }

  // Register player actor import header button for non-GM actor owners (#228).
  registerPlayerActorImportSheetHook();

  // Register Campaign Codex NPC Dossier widget when CC is active and compatible.
  // Defer via setTimeout so all other modules' ready hooks (including CC's API
  // setup) complete before we attempt registration.
  setTimeout(() => { registerCampaignCodexWidget(); }, 0);

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
          ...controlledCombatWriteDeclarations(settings.combatWritesEnabled),
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
          LIST_MACROS_DECLARATION,
          CHECK_CAMPAIGN_HEALTH_DECLARATION,
          AUDIT_CAMPAIGN_CONSISTENCY_DECLARATION,
          SEARCH_ROLL_TABLES_DECLARATION,
          LIST_PLAYLISTS_DECLARATION,
          SEARCH_PLAYLISTS_DECLARATION,
          GET_QUEST_OBJECTIVES_DECLARATION,
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
          if (request.capability === PROPOSE_COMBAT_WRITE_CAPABILITY) {
            return proposeCombatWrite(request.input as ProposeCombatWriteInput);
          }
          if (request.capability === EXECUTE_COMBAT_WRITE_CAPABILITY) {
            return executeCombatWrite(request.input as ExecuteCombatWriteInput);
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
            const { tools } = listMacroTools(request.input as Parameters<typeof listMacroTools>[0]);
            return {
              sourceId: registration.sources[0]?.sourceId ?? "foundry:unknown",
              sourceName: game.world?.title ?? "Unknown World",
              tools,
            };
          }
          if (request.capability === LIST_MACROS_CAPABILITY) {
            const { macros } = listMacros(request.input as Parameters<typeof listMacros>[0]);
            return {
              sourceId: registration.sources[0]?.sourceId ?? "foundry:unknown",
              sourceName: game.world?.title ?? "Unknown World",
              macros,
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
          if (request.capability === CHECK_CAMPAIGN_HEALTH_CAPABILITY) {
            return checkCampaignHealth(request.input as Parameters<typeof checkCampaignHealth>[0]);
          }
          if (request.capability === AUDIT_CAMPAIGN_CONSISTENCY_CAPABILITY) {
            return auditCampaignConsistency(request.input as Parameters<typeof auditCampaignConsistency>[0]);
          }
          if (request.capability === SEARCH_ROLL_TABLES_CAPABILITY) {
            return searchRollTables(request.input as Parameters<typeof searchRollTables>[0]);
          }
          if (request.capability === LIST_PLAYLISTS_CAPABILITY) {
            return listPlaylists(request.input as Parameters<typeof listPlaylists>[0]);
          }
          if (request.capability === SEARCH_PLAYLISTS_CAPABILITY) {
            return searchPlaylists(request.input as Parameters<typeof searchPlaylists>[0]);
          }
          if (request.capability === GET_QUEST_OBJECTIVES_CAPABILITY) {
            return getQuestObjectives(request.input as Parameters<typeof getQuestObjectives>[0]);
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
          if (event.event === LOREBRIDGE_EVENTS.rollbackAvailable) {
            void showRollbackAvailableChat(event.payload as RollbackAvailablePayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.combatApprovalRequired) {
            void showCombatWriteApproval(event.payload as CombatWriteApprovalPayload & { approvalProof: string });
          }
          if (event.event === LOREBRIDGE_EVENTS.actorCreateApprovalRequired) {
            void showActorCreateApprovalDialog(event.payload as ActorCreateApprovalPayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.actorUpdateApprovalRequired) {
            void showActorUpdateApprovalDialog(event.payload as ActorUpdateApprovalPayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.itemCreateApprovalRequired) {
            void showItemCreateApprovalDialog(event.payload as ItemCreateApprovalPayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.itemUpdateApprovalRequired) {
            void showItemUpdateApprovalDialog(event.payload as ItemUpdateApprovalPayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.encounterCreateApprovalRequired) {
            void showEncounterCreateApprovalDialog(event.payload as EncounterCreateApprovalPayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.sceneUpdateApprovalRequired) {
            void showSceneUpdateApprovalDialog(event.payload as SceneUpdateApprovalPayload);
          }
          if (event.event === LOREBRIDGE_EVENTS.questObjectivesApprovalRequired) {
            void showQuestObjectivesApprovalChat(event.payload as QuestObjectivesApprovalPayload);
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
      combatWritesEnabled: settings.combatWritesEnabled,
      backendConfigured: Boolean(settings.backendUrl),
      paired: Boolean(settings.clientToken)
    },
    summary,
    capabilities: [GET_WORLD_SUMMARY_DECLARATION, SEARCH_JOURNALS_DECLARATION, GET_JOURNAL_DECLARATION, GET_JOURNAL_PAGE_DECLARATION, SEARCH_ACTORS_DECLARATION, GET_ACTOR_DECLARATION, SEARCH_SCENES_DECLARATION, GET_SCENE_DECLARATION, GET_ACTIVE_SCENE_DECLARATION, GET_COMBAT_STATE_DECLARATION, ...controlledCombatWriteDeclarations(settings.combatWritesEnabled), ROLL_DICE_DECLARATION, RESOLVE_UUID_DECLARATION, SEARCH_CAMPAIGN_DECLARATION, GET_RELATED_DOCUMENTS_DECLARATION, SEARCH_ITEMS_DECLARATION, GET_ACTOR_INVENTORY_DECLARATION, SEARCH_SESSION_LOGS_DECLARATION, GET_SESSION_LOG_DECLARATION, LIST_COMPENDIUMS_DECLARATION, SEARCH_COMPENDIUM_DECLARATION, GET_COMPENDIUM_ENTRY_DECLARATION, LIST_MACRO_TOOLS_DECLARATION, EXECUTE_MACRO_TOOL_DECLARATION, LIST_MACROS_DECLARATION, CHECK_CAMPAIGN_HEALTH_DECLARATION, SEARCH_ROLL_TABLES_DECLARATION, LIST_PLAYLISTS_DECLARATION, SEARCH_PLAYLISTS_DECLARATION, GET_QUEST_OBJECTIVES_DECLARATION]
  });
  console.info(`${MODULE_LABEL} | Ready for ${summary.world.title}.`);

  // Temporary local development API. It exposes only explicitly approved,
  // typed capabilities and will be replaced by an authenticated dispatcher.
  Object.defineProperty(globalThis, "LoreBridge", {
    value: Object.freeze({
      version: moduleVersion,
      moduleVersion,
      protocolVersion: LOREBRIDGE_PROTOCOL_VERSION,
      capabilities: Object.freeze([GET_WORLD_SUMMARY_DECLARATION, SEARCH_JOURNALS_DECLARATION, GET_JOURNAL_DECLARATION, GET_JOURNAL_PAGE_DECLARATION, SEARCH_ACTORS_DECLARATION, GET_ACTOR_DECLARATION, SEARCH_SCENES_DECLARATION, GET_SCENE_DECLARATION, GET_ACTIVE_SCENE_DECLARATION, GET_COMBAT_STATE_DECLARATION, ...controlledCombatWriteDeclarations(settings.combatWritesEnabled), ROLL_DICE_DECLARATION, RESOLVE_UUID_DECLARATION, SEARCH_CAMPAIGN_DECLARATION, GET_RELATED_DOCUMENTS_DECLARATION, SEARCH_ITEMS_DECLARATION, GET_ACTOR_INVENTORY_DECLARATION, SEARCH_SESSION_LOGS_DECLARATION, GET_SESSION_LOG_DECLARATION, LIST_COMPENDIUMS_DECLARATION, SEARCH_COMPENDIUM_DECLARATION, GET_COMPENDIUM_ENTRY_DECLARATION, LIST_MACRO_TOOLS_DECLARATION, EXECUTE_MACRO_TOOL_DECLARATION, LIST_MACROS_DECLARATION, CHECK_CAMPAIGN_HEALTH_DECLARATION, SEARCH_ROLL_TABLES_DECLARATION, LIST_PLAYLISTS_DECLARATION, SEARCH_PLAYLISTS_DECLARATION, GET_QUEST_OBJECTIVES_DECLARATION]),
      settings: Object.freeze({
        capabilityApiEnabled: settings.capabilityApiEnabled,
        remoteIntegrationEnabled: settings.remoteIntegrationEnabled,
        provider: settings.provider,
        backendUrl: settings.backendUrl ? "configured" : "",
        paired: Boolean(settings.clientToken),
        combatWritesEnabled: settings.combatWritesEnabled
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
      [GET_QUEST_OBJECTIVES_CAPABILITY]: getQuestObjectives,
      approveQuestObjectivesWrite,
      rejectQuestObjectivesWrite,
      approveWrite,
      rejectWrite,
      rollbackWrite,
      proposeCombatWriteTest,
      proposeCombatWrite,
      approveCombatWrite,
      rejectCombatWrite,
      generateBoxedText,
      [CHECK_CAMPAIGN_HEALTH_CAPABILITY]: checkCampaignHealth,
      [AUDIT_CAMPAIGN_CONSISTENCY_CAPABILITY]: auditCampaignConsistency,
    }),
    configurable: true,
    writable: false
  });
});
