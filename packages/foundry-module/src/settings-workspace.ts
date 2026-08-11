import { LoreBridgeBackendClient } from "./backend-client.js";
import {
  LOREBRIDGE_SETTINGS,
  getFoundrySettingsApi,
  getLoreBridgeSettings,
} from "./settings.js";
import { openPlayerLoreAllowlistDialog } from "./capabilities/player-lore.js";
import { openProfileDialog } from "./context-profiles-app.js";
import {
  buildHistorySectionHtml,
  deleteHistoryEntry,
  clearHistory,
  getHistoryEntries,
} from "./generation-history.js";
import {
  getContextProfiles,
  saveContextProfiles,
} from "./capabilities/context-profile.js";
import {
  removeNonGmUsers,
  openBulkCreateDialog,
  openHotbarDistributeDialog,
} from "./capabilities/session-tools.js";

const MODULE_ID = "lorebridge";

type AnyRecord = Record<string, unknown>;

type AppV2Instance = {
  render(options?: AnyRecord): Promise<unknown>;
  close(options?: AnyRecord): Promise<unknown>;
  readonly element: HTMLElement;
};

type AppV2Static = {
  new (options?: AnyRecord): AppV2Instance;
  DEFAULT_OPTIONS: AnyRecord;
  PARTS?: AnyRecord;
};

const foundryApi = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: AnyRecord } };
  }
).foundry?.applications?.api as
  | {
      ApplicationV2?: AppV2Static;
      DialogV2?: { prompt(cfg: AnyRecord): Promise<unknown> };
    }
  | undefined;

const TestSafeBase: AppV2Static = class implements AppV2Instance {
  static DEFAULT_OPTIONS: AnyRecord = {};
  readonly element: HTMLElement = document.createElement("div");
  async render(_options?: AnyRecord): Promise<unknown> { return undefined; }
  async close(_options?: AnyRecord): Promise<unknown> { return undefined; }
};

const AppBase: AppV2Static = foundryApi?.ApplicationV2 ?? TestSafeBase;

// ---------------------------------------------------------------------------
// Section IDs
// ---------------------------------------------------------------------------

type SectionId =
  | "home"
  | "connection"
  | "features"
  | "ai-content"
  | "access-safety"
  | "session-tools"
  | "history"
  | "advanced";

const NAV_ITEMS: { id: SectionId; label: string; icon: string }[] = [
  { id: "home",          label: "Home",           icon: "fas fa-house" },
  { id: "connection",    label: "Connection",      icon: "fas fa-plug" },
  { id: "features",      label: "Features",        icon: "fas fa-sliders-h" },
  { id: "ai-content",    label: "AI & Content",    icon: "fas fa-magic" },
  { id: "access-safety", label: "Access & Safety", icon: "fas fa-shield-alt" },
  { id: "session-tools", label: "Session Tools",   icon: "fas fa-users-cog" },
  { id: "history",       label: "History",         icon: "fas fa-history" },
  { id: "advanced",      label: "Advanced",        icon: "fas fa-cogs" },
];

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toggle(
  key: string,
  label: string,
  value: boolean,
  hint: string,
): string {
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,.08)">
      <div style="flex:1">
        <div style="font-weight:bold;font-size:0.9em">${esc(label)}</div>
        <div style="font-size:0.78em;color:#888;margin-top:2px">${esc(hint)}</div>
      </div>
      <label class="lb-switch" style="flex-shrink:0">
        <input type="checkbox" name="${esc(key)}" ${value ? "checked" : ""}>
        <span class="lb-slider"></span>
      </label>
    </div>`;
}

function sectionHeader(title: string, hint?: string): string {
  return `
    <div style="margin-bottom:16px">
      <h3 style="margin:0 0 4px;font-size:1.05em">${esc(title)}</h3>
      ${hint ? `<p style="margin:0;font-size:0.82em;color:#888">${esc(hint)}</p>` : ""}
    </div>`;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildHomeHtml(): string {
  return `
    <div style="padding:20px 24px">
      ${sectionHeader("LoreBridge Settings")}
      <p style="font-size:0.9em;color:#aaa;margin-bottom:24px">
        Configure connection, features, AI content options, access controls, and more.
        Use the navigation on the left to jump to any section.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${[
          { id: "connection",    icon: "fas fa-plug",        label: "Connection",      desc: "Backend URL, pairing status" },
          { id: "features",      icon: "fas fa-sliders-h",   label: "Features",        desc: "Enable / disable capabilities" },
          { id: "ai-content",    icon: "fas fa-magic",       label: "AI & Content",    desc: "Provider, session log, compendiums" },
          { id: "access-safety", icon: "fas fa-shield-alt",  label: "Access & Safety", desc: "Context profiles, player lore" },
          { id: "session-tools", icon: "fas fa-users-cog",  label: "Session Tools",   desc: "Bulk create, hotbar, reset" },
          { id: "history",       icon: "fas fa-history",     label: "History",         desc: "Recent AI generations" },
          { id: "advanced",      icon: "fas fa-cogs",        label: "Advanced",        desc: "Portrait directory, history length" },
        ].map(({ id, icon, label, desc }) => `
          <button data-action="nav" data-section="${id}"
            style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);border-radius:6px;cursor:pointer;text-align:left">
            <i class="${icon}" style="font-size:1.2em;color:#7ab;width:20px;text-align:center"></i>
            <div>
              <div style="font-weight:bold;font-size:0.88em">${esc(label)}</div>
              <div style="font-size:0.76em;color:#888">${esc(desc)}</div>
            </div>
          </button>`).join("")}
      </div>
    </div>`;
}

async function buildConnectionHtml(): Promise<string> {
  const s = getLoreBridgeSettings();
  let status = s.backendUrl ? "Not checked" : "Not configured";
  let backendId = "";
  let fingerprint = "";
  let paired = false;

  if (s.backendUrl) {
    try {
      const client = new LoreBridgeBackendClient(s.backendUrl, s.clientToken);
      const [health, identity] = await Promise.all([client.health(), client.identity()]);
      status = `Connected — backend ${health.version}`;
      backendId = identity.id;
      fingerprint = identity.fingerprint;
      if (s.clientToken) {
        paired = (await client.pairingStatus()).paired;
      }
    } catch (err) {
      status = err instanceof Error ? err.message : "Connection failed";
    }
  }

  const statusColor = status.startsWith("Connected") ? "#4a4" : "#a44";

  return `
    <div style="padding:20px 24px">
      ${sectionHeader("Connection", "Configure the LoreBridge backend URL and pair this GM browser.")}
      <div style="margin-bottom:16px">
        <label style="font-size:0.85em;font-weight:bold;display:block;margin-bottom:4px">Backend URL</label>
        <div style="display:flex;gap:8px">
          <input type="text" name="backendUrl" value="${esc(s.backendUrl)}"
            placeholder="https://your-backend-url"
            style="flex:1;padding:6px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd">
          <button data-action="conn-save-url" style="padding:6px 14px;white-space:nowrap">
            <i class="fas fa-save"></i> Save
          </button>
          <button data-action="conn-check" style="padding:6px 14px;white-space:nowrap">
            <i class="fas fa-plug"></i> Check
          </button>
        </div>
      </div>
      <div style="padding:8px 12px;border-radius:4px;border:1px solid rgba(0,0,0,.2);margin-bottom:16px;font-size:0.85em">
        <strong>Status:</strong> <span style="color:${statusColor}">${esc(status)}</span>
        ${backendId ? `<br><strong>Backend ID:</strong> ${esc(backendId)}` : ""}
        ${fingerprint ? `<br><strong>Fingerprint:</strong> <code style="font-size:0.9em">${esc(fingerprint)}</code>` : ""}
        ${backendId ? `<br><strong>Paired:</strong> ${paired ? '<span style="color:#4a4">Yes</span>' : '<span style="color:#a44">No</span>'}` : ""}
      </div>
      ${!paired ? `
      <button data-action="conn-pair" style="padding:6px 14px;margin-right:8px">
        <i class="fas fa-link"></i> Pair This Browser
      </button>` : `
      <button data-action="conn-unpair" style="padding:6px 14px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a">
        <i class="fas fa-unlink"></i> Unpair
      </button>`}
    </div>`;
}

function buildFeaturesHtml(): string {
  const s = getLoreBridgeSettings();
  return `
    <div style="padding:20px 24px">
      ${sectionHeader("Features", "Toggle which LoreBridge capabilities are active. Most changes apply immediately; Campaign Codex NPC Dossier requires a reload.")}
      ${toggle(LOREBRIDGE_SETTINGS.uiButtonsEnabled,       "UI Buttons",                    s.uiButtonsEnabled,       "Show LoreBridge generation buttons on supported sheets.")}
      ${toggle(LOREBRIDGE_SETTINGS.chatCommandEnabled,     "/lb Chat Command",              s.chatCommandEnabled,     "Allow /lb commands in chat.")}
      ${toggle(LOREBRIDGE_SETTINGS.journalQaEnabled,       "Journal Page Q&A Panel",        s.journalQaEnabled,       "Show the Ask LoreBridge panel on journal sheets.")}
      ${toggle(LOREBRIDGE_SETTINGS.npcMentionEnabled,      "@NPC Mention Responses",        s.npcMentionEnabled,      "Let players address AI-enabled NPCs via @ActorName in chat.")}
      ${toggle(LOREBRIDGE_SETTINGS.campaignCodexEnabled,   "Campaign Codex NPC Dossier",    s.campaignCodexEnabled,   "Register NPC Dossier widgets with Campaign Codex and auto-add them to NPC journals. Requires Campaign Codex. Requires reload. Dossier data is preserved when disabled.")}
      ${toggle(LOREBRIDGE_SETTINGS.writesEnabled,        "AI-Proposed Writes",      s.writesEnabled,        "Allow AI to propose journal page updates (GM approval required).")}
      ${toggle(LOREBRIDGE_SETTINGS.combatWritesEnabled,  "Controlled Combat Writes",s.combatWritesEnabled,  "Allow narrowly typed combat action proposals (GM approval required).")}
      ${toggle(LOREBRIDGE_SETTINGS.playerLoreEnabled,    "Player Lore Assistant",   s.playerLoreEnabled,    "Let players use /lb ask to query GM-published player-visible journals.")}
      <div style="margin-top:16px;text-align:right">
        <button data-action="features-save" style="padding:6px 16px">
          <i class="fas fa-save"></i> Save Features
        </button>
      </div>
    </div>`;
}

function buildAiContentHtml(): string {
  const s = getLoreBridgeSettings();
  const providerOptions = [
    { value: "none",      label: "None" },
    { value: "anthropic", label: "Claude (Anthropic)" },
    { value: "openai",    label: "OpenAI" },
  ].map(({ value, label }) =>
    `<option value="${value}" ${s.provider === value ? "selected" : ""}>${esc(label)}</option>`,
  ).join("");

  return `
    <div style="padding:20px 24px">
      ${sectionHeader("AI & Content", "Configure the AI provider and content access settings.")}
      <div style="margin-bottom:14px">
        <label style="font-size:0.85em;font-weight:bold;display:block;margin-bottom:4px">Remote AI Provider</label>
        <p style="margin:0 0 6px;font-size:0.78em;color:#888">Provider used by the LoreBridge backend. Credentials are not stored in Foundry.</p>
        <select name="${LOREBRIDGE_SETTINGS.provider}"
          style="width:240px;padding:5px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd">
          ${providerOptions}
        </select>
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:0.85em;font-weight:bold;display:block;margin-bottom:4px">Session Log Journal</label>
        <p style="margin:0 0 6px;font-size:0.78em;color:#888">Name of the journal containing session log pages. Each page is one session entry.</p>
        <input type="text" name="${LOREBRIDGE_SETTINGS.sessionLogFolder}"
          value="${esc(s.sessionLogFolder)}"
          style="width:300px;padding:5px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd">
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:0.85em;font-weight:bold;display:block;margin-bottom:4px">Excluded Compendiums</label>
        <p style="margin:0 0 6px;font-size:0.78em;color:#888">Comma-separated compendium pack IDs to hide from LoreBridge (e.g. dnd5e.spells,world.private).</p>
        <input type="text" name="${LOREBRIDGE_SETTINGS.excludedCompendiums}"
          value="${esc(s.excludedCompendiums)}"
          style="width:100%;padding:5px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd">
      </div>
      <div style="margin-top:16px;text-align:right">
        <button data-action="ai-content-save" style="padding:6px 16px">
          <i class="fas fa-save"></i> Save
        </button>
      </div>
    </div>`;
}

function buildAccessSafetyHtml(): string {
  const profiles = getContextProfiles();
  const activeId = String(
    getFoundrySettingsApi().get(MODULE_ID, LOREBRIDGE_SETTINGS.activeContextProfileId) ?? "",
  );

  const profileRows = profiles.length === 0
    ? `<p style="text-align:center;color:#888;margin:12px 0;font-size:0.85em">No profiles yet. Create one to scope LoreBridge queries.</p>`
    : profiles.map((p) => {
        const isActive = p.id === activeId;
        const typesLabel = (p.allowedDocTypes?.length ?? 0) > 0
          ? p.allowedDocTypes!.join(", ")
          : "All";
        return `
          <tr style="border-bottom:1px solid rgba(0,0,0,.1)${isActive ? ";background:rgba(52,152,219,.08)" : ""}">
            <td style="padding:5px 8px;font-weight:${isActive ? "bold" : "normal"}">${esc(p.name)}</td>
            <td style="padding:5px 8px;color:#888;font-size:0.82em">${esc(typesLabel)}</td>
            <td style="padding:5px 8px;white-space:nowrap;text-align:right">
              ${isActive
                ? `<em style="color:#3498db;font-size:0.82em;margin-right:6px">Active</em>`
                : `<button data-action="profile-activate" data-id="${esc(p.id)}" style="padding:1px 8px;font-size:0.8em;margin-right:4px">Set Active</button>`}
              <button data-action="profile-edit" data-id="${esc(p.id)}" style="padding:1px 8px;font-size:0.8em;margin-right:4px">Edit</button>
              <button data-action="profile-delete" data-id="${esc(p.id)}" style="padding:1px 8px;font-size:0.8em;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a">Delete</button>
            </td>
          </tr>`;
      }).join("");

  const activeName = profiles.find((p) => p.id === activeId)?.name;

  return `
    <div style="padding:20px 24px">
      ${sectionHeader("Access & Safety", "Context profiles scope which documents LoreBridge can access. Player Lore controls what players can query.")}

      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong style="font-size:0.9em">Context Profiles</strong>
        <button data-action="profile-new" style="padding:3px 12px;font-size:0.82em">
          <i class="fas fa-plus"></i> New Profile
        </button>
      </div>
      ${activeId
        ? `<div style="padding:6px 10px;background:rgba(52,152,219,.12);border:1px solid rgba(52,152,219,.3);border-radius:4px;font-size:0.82em;margin-bottom:8px">
            Active profile: <strong>${esc(activeName ?? activeId)}</strong>
            <button data-action="profile-clear-active" style="float:right;padding:1px 8px;font-size:0.8em">Clear</button>
           </div>`
        : `<div style="padding:6px 10px;background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);border-radius:4px;font-size:0.82em;color:#888;margin-bottom:8px">
            No active profile — all documents accessible.
           </div>`}
      <div style="overflow-x:auto;margin-bottom:20px">
        <table style="width:100%;border-collapse:collapse;font-size:0.85em">
          <thead>
            <tr style="border-bottom:2px solid rgba(0,0,0,.2);text-align:left">
              <th style="padding:4px 8px">Name</th>
              <th style="padding:4px 8px">Types</th>
              <th style="padding:4px 8px"></th>
            </tr>
          </thead>
          <tbody>${profileRows}</tbody>
        </table>
      </div>

      <div style="border-top:1px solid rgba(0,0,0,.12);padding-top:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <strong style="font-size:0.9em">Player Lore Allowlist</strong>
          <button data-action="player-lore-allowlist" style="padding:3px 12px;font-size:0.82em">
            <i class="fas fa-book-open"></i> Configure Allowlist
          </button>
        </div>
        <p style="margin:0;font-size:0.78em;color:#888">
          Choose which player-visible journals players can query with /lb ask. Requires the Player Lore feature to be enabled.
        </p>
      </div>
    </div>`;
}

function buildHistoryHtml(): string {
  const entries = getHistoryEntries();
  return `<div style="padding:20px 24px">
    ${sectionHeader("Generation History", "Recent AI-generated content. Delete individual entries or clear all.")}
    <div id="lb-settings-history-content">
      ${buildHistorySectionHtml(entries)}
    </div>
  </div>`;
}

function buildSessionToolsHtml(): string {
  return `
    <div style="padding:20px 24px">
      ${sectionHeader("Session Tools", "GM-only tools for table setup, hotbar distribution, and session reset. All destructive actions require explicit confirmation.")}

      <div style="margin-bottom:20px">
        <div style="font-weight:bold;font-size:0.9em;margin-bottom:6px">
          <i class="fas fa-users" style="margin-right:6px;color:#7ab"></i>Bulk User &amp; Actor Creation
        </div>
        <p style="margin:0 0 8px;font-size:0.82em;color:#888">
          Create one Foundry user and blank actor per player name. Generates random passwords and links each user to their actor.
          Use <code>Name+N</code> syntax to create extra actors per user (e.g. Thalindra+2).
        </p>
        <button data-action="session-bulk-create" style="padding:6px 14px">
          <i class="fas fa-user-plus"></i> Create Users &amp; Actors…
        </button>
      </div>

      <div style="margin-bottom:20px;padding-top:16px;border-top:1px solid rgba(0,0,0,.1)">
        <div style="font-weight:bold;font-size:0.9em;margin-bottom:6px">
          <i class="fas fa-share" style="margin-right:6px;color:#7ab"></i>Distribute Hotbar to Players
        </div>
        <p style="margin:0 0 8px;font-size:0.82em;color:#888">
          Copy one or more GM hotbar pages to all currently connected players. Player hotbar pages are overwritten.
          Disconnected players are not affected.
        </p>
        <button data-action="session-hotbar-distribute" style="padding:6px 14px">
          <i class="fas fa-share"></i> Distribute Hotbar…
        </button>
      </div>

      <div style="margin-bottom:20px;padding-top:16px;border-top:1px solid rgba(0,0,0,.1)">
        <div style="font-weight:bold;font-size:0.9em;margin-bottom:6px">
          <i class="fas fa-trash" style="margin-right:6px;color:#a44"></i>Remove All Player Accounts
        </div>
        <p style="margin:0 0 8px;font-size:0.82em;color:#888">
          Delete all Player and Trusted Player accounts from this world. GM and Assistant GM accounts are never affected.
          Use this to reset before a new campaign or one-shot. Requires explicit confirmation listing all affected accounts.
        </p>
        <button data-action="session-remove-users" style="padding:6px 14px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a">
          <i class="fas fa-trash"></i> Remove All Players…
        </button>
      </div>

      <div style="padding-top:16px;border-top:1px solid rgba(0,0,0,.1)">
        <div style="font-weight:bold;font-size:0.9em;margin-bottom:6px">
          <i class="fas fa-file-import" style="margin-right:6px;color:#7ab"></i>Player Character Import
        </div>
        <p style="margin:0;font-size:0.82em;color:#888">
          Players with Owner permission on an actor can import their character from a GitHub backup directly from the actor sheet header.
          The <strong>Import from Backup</strong> button appears on owned character sheets when the LoreBridge backend is configured with a GitHub backup repository.
        </p>
      </div>
    </div>`;
}

function buildAdvancedHtml(): string {
  const s = getLoreBridgeSettings();
  const maxLen = Number(
    getFoundrySettingsApi().get(MODULE_ID, LOREBRIDGE_SETTINGS.maxHistoryLength) ?? 10,
  );
  const saveImages = Boolean(
    getFoundrySettingsApi().get(MODULE_ID, LOREBRIDGE_SETTINGS.historySaveImages) ?? true,
  );

  return `
    <div style="padding:20px 24px">
      ${sectionHeader("Advanced", "Low-level settings that rarely need to change.")}
      <div style="margin-bottom:14px">
        <label style="font-size:0.85em;font-weight:bold;display:block;margin-bottom:4px">Portrait Save Directory</label>
        <p style="margin:0 0 6px;font-size:0.78em;color:#888">Foundry Data-relative path where AI-generated portraits are saved (e.g. Artwork/Portraits/LoreBridge).</p>
        <input type="text" name="${LOREBRIDGE_SETTINGS.portraitSaveDirectory}"
          value="${esc(s.portraitSaveDirectory)}"
          style="width:100%;padding:5px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd">
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:0.85em;font-weight:bold;display:block;margin-bottom:4px">Max Generation History Length</label>
        <p style="margin:0 0 6px;font-size:0.78em;color:#888">Oldest entries are pruned automatically when the limit is exceeded.</p>
        <input type="number" name="${LOREBRIDGE_SETTINGS.maxHistoryLength}"
          value="${maxLen}" min="1" max="200"
          style="width:80px;padding:5px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd">
      </div>
      <div style="margin-bottom:14px">
        ${toggle(LOREBRIDGE_SETTINGS.historySaveImages, "Save Generated Images to History", saveImages, "Include AI-generated portrait and token images in generation history entries.")}
      </div>
      <div style="margin-bottom:14px">
        ${toggle(LOREBRIDGE_SETTINGS.capabilityApiEnabled, "Enable Capability API", getLoreBridgeSettings().capabilityApiEnabled, "Expose approved LoreBridge capabilities to the GM browser session.")}
      </div>
      <div style="margin-bottom:14px">
        ${toggle(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, "Enable Remote AI Integration", getLoreBridgeSettings().remoteIntegrationEnabled, "Allow LoreBridge to connect to a configured backend service.")}
      </div>
      <div style="margin-top:16px;text-align:right">
        <button data-action="advanced-save" style="padding:6px 16px">
          <i class="fas fa-save"></i> Save
        </button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Workspace ApplicationV2
// ---------------------------------------------------------------------------

export class LoreBridgeSettingsApp extends AppBase {
  static override DEFAULT_OPTIONS: AnyRecord = {
    id: "lorebridge-settings-workspace",
    window: { title: "LoreBridge Settings", resizable: true },
    position: { width: 900, height: 620 },
    actions: {
      nav: LoreBridgeSettingsApp._onNav,
      "conn-save-url": LoreBridgeSettingsApp._onConnSaveUrl,
      "conn-check": LoreBridgeSettingsApp._onConnCheck,
      "conn-pair": LoreBridgeSettingsApp._onConnPair,
      "conn-unpair": LoreBridgeSettingsApp._onConnUnpair,
      "features-save": LoreBridgeSettingsApp._onFeaturesSave,
      "ai-content-save": LoreBridgeSettingsApp._onAiContentSave,
      "profile-new": LoreBridgeSettingsApp._onProfileNew,
      "profile-activate": LoreBridgeSettingsApp._onProfileActivate,
      "profile-clear-active": LoreBridgeSettingsApp._onProfileClearActive,
      "profile-edit": LoreBridgeSettingsApp._onProfileEdit,
      "profile-delete": LoreBridgeSettingsApp._onProfileDelete,
      "player-lore-allowlist": LoreBridgeSettingsApp._onPlayerLoreAllowlist,
      "session-bulk-create": LoreBridgeSettingsApp._onSessionBulkCreate,
      "session-hotbar-distribute": LoreBridgeSettingsApp._onSessionHotbarDistribute,
      "session-remove-users": LoreBridgeSettingsApp._onSessionRemoveUsers,
      "history-delete": LoreBridgeSettingsApp._onHistoryDelete,
      "history-reopen": LoreBridgeSettingsApp._onHistoryReopen,
      "history-clear-all": LoreBridgeSettingsApp._onHistoryClearAll,
      "advanced-save": LoreBridgeSettingsApp._onAdvancedSave,
    },
  };

  private _activeSection: SectionId = "home";

  private static _instance: LoreBridgeSettingsApp | null = null;

  static open(): void {
    if (!LoreBridgeSettingsApp._instance) {
      LoreBridgeSettingsApp._instance = new LoreBridgeSettingsApp();
    }
    void (LoreBridgeSettingsApp._instance as unknown as AppV2Instance).render({ force: true });
  }

  async _renderHTML(_context: AnyRecord, _options: unknown): Promise<HTMLElement> {
    const sectionContent = await this._buildSectionContent();
    const navHtml = NAV_ITEMS.map((n) => {
      const active = n.id === this._activeSection;
      return `<button type="button" data-action="nav" data-section="${n.id}"
        style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;
               background:${active ? "rgba(52,152,219,.18)" : "transparent"};
               border:none;border-left:3px solid ${active ? "#3498db" : "transparent"};
               cursor:pointer;text-align:left;font-size:0.85em;
               color:${active ? "#3498db" : "inherit"}">
        <i class="${n.icon}" style="width:16px;text-align:center"></i>
        ${esc(n.label)}
      </button>`;
    }).join("");

    const container = document.createElement("div");
    container.innerHTML = `
      <style>
        .lb-switch { position:relative; display:inline-block; width:44px; height:24px; }
        .lb-switch input { opacity:0; width:0; height:0; position:absolute; }
        .lb-slider { position:absolute; cursor:pointer; inset:0; background:#555; border-radius:24px; transition:.25s; }
        .lb-slider::before { content:""; position:absolute; width:18px; height:18px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.25s; }
        .lb-switch input:checked + .lb-slider { background:#3498db; }
        .lb-switch input:checked + .lb-slider::before { transform:translateX(20px); }
        .lb-switch input:focus-visible + .lb-slider { outline:2px solid #3498db; outline-offset:2px; }
      </style>
      <div style="display:flex;height:100%;overflow:hidden">
        <nav style="width:160px;flex-shrink:0;border-right:1px solid rgba(0,0,0,.2);overflow-y:auto;padding:8px 0">
          ${navHtml}
        </nav>
        <div style="flex:1;overflow-y:auto;min-width:0">
          ${sectionContent}
        </div>
      </div>`;
    return container;
  }

  _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
    content.replaceChildren(...Array.from(result.childNodes));
  }

  private async _buildSectionContent(): Promise<string> {
    switch (this._activeSection) {
      case "home":          return buildHomeHtml();
      case "connection":    return buildConnectionHtml();
      case "features":      return buildFeaturesHtml();
      case "ai-content":    return buildAiContentHtml();
      case "access-safety": return buildAccessSafetyHtml();
      case "session-tools": return buildSessionToolsHtml();
      case "history":       return buildHistoryHtml();
      case "advanced":      return buildAdvancedHtml();
    }
  }

  private _self(): AppV2Instance {
    return this as unknown as AppV2Instance;
  }

  // ---------------------------------------------------------------------------
  // Nav
  // ---------------------------------------------------------------------------

  static _onNav(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): void {
    const section = target.dataset["section"] as SectionId | undefined;
    if (!section) return;
    this._activeSection = section;
    void this._self().render({ force: false });
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  static async _onConnSaveUrl(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    const url = this._readInput("backendUrl");
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, url);
    ui.notifications.info("LoreBridge: Backend URL saved.");
    void this._self().render({ force: false });
  }

  static async _onConnCheck(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    const url = this._readInput("backendUrl");
    if (url) await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, url);
    try {
      const s = getLoreBridgeSettings();
      const client = new LoreBridgeBackendClient(url || s.backendUrl, s.clientToken);
      const health = await client.health();
      ui.notifications.info(`LoreBridge: Connected — backend ${health.version}`);
    } catch (err) {
      ui.notifications.error(err instanceof Error ? err.message : "Connection failed.");
    }
    void this._self().render({ force: false });
  }

  static async _onConnPair(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    try {
      const s = getLoreBridgeSettings();
      const client = new LoreBridgeBackendClient(s.backendUrl);
      const attempt = await client.startPairing();
      const code = await LoreBridgeSettingsApp._promptForPairingCode(
        attempt.code,
        attempt.expiresAt,
      );
      if (!code) return;
      const result = await client.completePairing(code, `Foundry ${(game as AnyRecord).version ?? "v14"}`);
      await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, result.token);
      ui.notifications.info(`LoreBridge: Paired with ${result.backendId}.`);
      void this._self().render({ force: false });
    } catch (err) {
      ui.notifications.error(err instanceof Error ? err.message : "Pairing failed.");
    }
  }

  static async _onConnUnpair(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, "");
    ui.notifications.info("LoreBridge: Pairing removed from this browser.");
    void this._self().render({ force: false });
  }

  private static async _promptForPairingCode(
    suggestedCode: string,
    expiresAt: string,
  ): Promise<string | undefined> {
    const DialogV2 = foundryApi?.DialogV2;
    if (!DialogV2) throw new Error("DialogV2 unavailable.");
    let code: string | undefined;
    await DialogV2.prompt({
      window: { title: "Pair LoreBridge" },
      content: `
        <p>The backend created pairing code <strong>${suggestedCode}</strong>.</p>
        <p>Confirm the code before ${new Date(expiresAt).toLocaleTimeString()}.</p>
        <div class="form-group">
          <label>Pairing Code</label>
          <input type="text" name="pairingCode" value="${suggestedCode}" autocomplete="one-time-code">
        </div>`,
      ok: {
        icon: "fas fa-link",
        label: "Pair",
        callback: (_event: Event, button: HTMLButtonElement) => {
          const input = button.form?.querySelector<HTMLInputElement>("input[name='pairingCode']");
          code = input?.value.trim();
        },
      },
      rejectClose: false,
    });
    return code;
  }

  // ---------------------------------------------------------------------------
  // Features
  // ---------------------------------------------------------------------------

  static async _onFeaturesSave(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    const api = getFoundrySettingsApi();
    const checked = (name: string) =>
      this._self().element.querySelector<HTMLInputElement>(`input[name='${name}']`)?.checked ?? false;

    const oldCcEnabled = getLoreBridgeSettings().campaignCodexEnabled;
    const newCcEnabled = checked(LOREBRIDGE_SETTINGS.campaignCodexEnabled);

    await Promise.all([
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.uiButtonsEnabled,    checked(LOREBRIDGE_SETTINGS.uiButtonsEnabled)),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.chatCommandEnabled,   checked(LOREBRIDGE_SETTINGS.chatCommandEnabled)),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.journalQaEnabled,     checked(LOREBRIDGE_SETTINGS.journalQaEnabled)),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.npcMentionEnabled,      checked(LOREBRIDGE_SETTINGS.npcMentionEnabled)),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.campaignCodexEnabled,   newCcEnabled),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.writesEnabled,          checked(LOREBRIDGE_SETTINGS.writesEnabled)),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.combatWritesEnabled,    checked(LOREBRIDGE_SETTINGS.combatWritesEnabled)),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.playerLoreEnabled,      checked(LOREBRIDGE_SETTINGS.playerLoreEnabled)),
    ]);
    ui.notifications.info("LoreBridge: Feature settings saved.");

    if (oldCcEnabled !== newCcEnabled) {
      await LoreBridgeSettingsApp._promptReload(
        "The Campaign Codex NPC Dossier setting requires a Foundry reload to take effect.",
      );
    } else {
      void this._self().render({ force: false });
    }
  }

  private static async _promptReload(message: string): Promise<void> {
    const DialogV2 = foundryApi?.DialogV2;
    if (!DialogV2) {
      ui.notifications.warn(`LoreBridge: ${message} Please reload Foundry manually.`);
      return;
    }
    const confirmed = await DialogV2.prompt({
      window: { title: "Reload Required" },
      content: `<p>${message}</p><p>Would you like to reload Foundry now?</p>`,
      ok: { label: "Reload Now", icon: "fas fa-sync" },
      rejectClose: false,
    });
    if (confirmed !== null) {
      window.location.reload();
    }
  }

  // ---------------------------------------------------------------------------
  // AI & Content
  // ---------------------------------------------------------------------------

  static async _onAiContentSave(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    const api = getFoundrySettingsApi();
    const el = this._self().element;
    const provider = el.querySelector<HTMLSelectElement>(`select[name='${LOREBRIDGE_SETTINGS.provider}']`)?.value ?? "none";
    const sessionLog = el.querySelector<HTMLInputElement>(`input[name='${LOREBRIDGE_SETTINGS.sessionLogFolder}']`)?.value.trim() ?? "";
    const excluded = el.querySelector<HTMLInputElement>(`input[name='${LOREBRIDGE_SETTINGS.excludedCompendiums}']`)?.value.trim() ?? "";

    await Promise.all([
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.provider,             provider),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.sessionLogFolder,     sessionLog),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.excludedCompendiums,  excluded),
    ]);
    ui.notifications.info("LoreBridge: AI & Content settings saved.");
    void this._self().render({ force: false });
  }

  // ---------------------------------------------------------------------------
  // Context profiles
  // ---------------------------------------------------------------------------

  static _onProfileNew(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): void {
    openProfileDialog(null, async (profile) => {
      const profiles = getContextProfiles();
      profiles.push(profile);
      await saveContextProfiles(profiles);
      void this._self().render({ force: false });
    });
  }

  static async _onProfileActivate(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset["id"] ?? "";
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.activeContextProfileId, id);
    void this._self().render({ force: false });
  }

  static async _onProfileClearActive(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.activeContextProfileId, "");
    void this._self().render({ force: false });
  }

  static _onProfileEdit(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): void {
    const id = target.dataset["id"] ?? "";
    const profile = getContextProfiles().find((p) => p.id === id);
    if (!profile) return;
    openProfileDialog(profile, async (updated) => {
      const profiles = getContextProfiles().map((p) => (p.id === updated.id ? updated : p));
      await saveContextProfiles(profiles);
      void this._self().render({ force: false });
    });
  }

  static async _onProfileDelete(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset["id"] ?? "";
    const profiles = getContextProfiles().filter((p) => p.id !== id);
    await saveContextProfiles(profiles);
    const activeId = String(
      getFoundrySettingsApi().get(MODULE_ID, LOREBRIDGE_SETTINGS.activeContextProfileId) ?? "",
    );
    if (activeId === id) {
      await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.activeContextProfileId, "");
    }
    void this._self().render({ force: false });
  }

  static _onPlayerLoreAllowlist(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): void {
    openPlayerLoreAllowlistDialog();
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  static async _onHistoryDelete(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset["entryId"] ?? "";
    await deleteHistoryEntry(id);
    void this._self().render({ force: false });
  }

  static _onHistoryReopen(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): void {
    const id = target.dataset["entryId"] ?? "";
    const entry = getHistoryEntries().find((e) => e.id === id);
    if (!entry) return;

    const escaped = String(entry.content)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    type DialogV2Ctor = new (opts: AnyRecord) => { render(opts: AnyRecord): unknown };
    const DialogV2Cls = (
      (globalThis as unknown as { foundry?: { applications?: { api?: { DialogV2?: unknown } } } })
        .foundry?.applications?.api?.DialogV2
    ) as DialogV2Ctor | undefined;
    if (!DialogV2Cls) return;
    new DialogV2Cls({
      window: { title: entry.label, resizable: true },
      position: { width: 540, height: "auto" },
      content: `<div style="padding:0.5rem;max-height:420px;overflow-y:auto;font-size:0.9em">
        <p style="color:#888;font-size:0.82em;margin-bottom:0.5rem">
          ${esc(entry.type)} &mdash; ${new Date(entry.timestamp).toLocaleString()}<br>
          <em>${esc(entry.prompt)}</em>
        </p>
        <hr>
        <p>${escaped}</p>
      </div>`,
      buttons: [
        {
          action: "copy",
          label: "Copy to Clipboard",
          icon: "fas fa-copy",
          callback: () => {
            void navigator.clipboard.writeText(entry.content).then(() => {
              ui.notifications.info("LoreBridge: Copied to clipboard.");
            });
          },
        },
        { action: "close", label: "Close", default: true },
      ],
    } as AnyRecord).render({ force: true } as AnyRecord);
  }

  static async _onHistoryClearAll(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    await clearHistory();
    void this._self().render({ force: false });
  }

  // ---------------------------------------------------------------------------
  // Advanced
  // ---------------------------------------------------------------------------

  static async _onAdvancedSave(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    const api = getFoundrySettingsApi();
    const el = this._self().element;

    const portraitDir = el.querySelector<HTMLInputElement>(`input[name='${LOREBRIDGE_SETTINGS.portraitSaveDirectory}']`)?.value.trim() ?? "";
    const maxLen = Number(el.querySelector<HTMLInputElement>(`input[name='${LOREBRIDGE_SETTINGS.maxHistoryLength}']`)?.value ?? 10);
    const saveImages = el.querySelector<HTMLInputElement>(`input[name='${LOREBRIDGE_SETTINGS.historySaveImages}']`)?.checked ?? true;
    const capEnabled = el.querySelector<HTMLInputElement>(`input[name='${LOREBRIDGE_SETTINGS.capabilityApiEnabled}']`)?.checked ?? true;
    const remoteEnabled = el.querySelector<HTMLInputElement>(`input[name='${LOREBRIDGE_SETTINGS.remoteIntegrationEnabled}']`)?.checked ?? false;

    await Promise.all([
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.portraitSaveDirectory,   portraitDir),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.maxHistoryLength,        Math.max(1, maxLen)),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.historySaveImages,       saveImages),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.capabilityApiEnabled,    capEnabled),
      api.set(MODULE_ID, LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, remoteEnabled),
    ]);
    ui.notifications.info("LoreBridge: Advanced settings saved.");
    void this._self().render({ force: false });
  }

  // ---------------------------------------------------------------------------
  // Session Tools (#230, #231, #232)
  // ---------------------------------------------------------------------------

  static async _onSessionBulkCreate(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    try {
      await openBulkCreateDialog();
    } catch (err) {
      ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Operation failed."}`);
    }
  }

  static async _onSessionHotbarDistribute(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    try {
      await openHotbarDistributeDialog();
    } catch (err) {
      ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Operation failed."}`);
    }
  }

  static async _onSessionRemoveUsers(
    this: LoreBridgeSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    try {
      await removeNonGmUsers();
    } catch (err) {
      ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Operation failed."}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Shared helper
  // ---------------------------------------------------------------------------

  private _readInput(name: string): string {
    return this._self().element.querySelector<HTMLInputElement>(`input[name='${name}']`)?.value.trim() ?? "";
  }
}
