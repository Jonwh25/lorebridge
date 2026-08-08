import { getLoreBridgeSettings } from "../settings.js";
import { addHistoryEntry } from "../generation-history.js";

// ---------------------------------------------------------------------------
// Types — mirror the backend NpcProfileSections model
// ---------------------------------------------------------------------------

type NpcSection =
  | "overview"
  | "gender"
  | "appearance"
  | "personalityAndMotivation"
  | "relationships"
  | "secretsAndStory"
  | "history"
  | "gameplay";

type NpcProfileSections = {
  overview?: Record<string, string>;
  gender?: Record<string, string>;
  appearance?: Record<string, string>;
  personalityAndMotivation?: Record<string, string>;
  relationships?: Record<string, string>;
  secretsAndStory?: Record<string, string>;
  history?: Record<string, string>;
  gameplay?: Record<string, string>;
};

type FieldMeta = { key: string; label: string; editType?: "gender" | "presentation" };

type SectionMeta = {
  id: NpcSection;
  label: string;
  shortLabel: string;
  icon: string;
  fields: FieldMeta[];
};

const SECTION_META: SectionMeta[] = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    icon: "fas fa-id-card",
    fields: [
      { key: "race", label: "Race" },
      { key: "occupation", label: "Occupation" },
      { key: "alignment", label: "Alignment" },
      { key: "age", label: "Age" },
      { key: "faith", label: "Faith" },
      { key: "socialClass", label: "Social Class" },
      { key: "reputation", label: "Reputation" },
      { key: "residence", label: "Residence" },
      { key: "languages", label: "Languages" },
    ],
  },
  {
    id: "gender",
    label: "Gender",
    shortLabel: "Gender",
    icon: "fas fa-venus-mars",
    fields: [
      { key: "gender", label: "Gender", editType: "gender" },
      { key: "genderPresentation", label: "Presentation", editType: "presentation" },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    shortLabel: "Appearance",
    icon: "fas fa-eye",
    fields: [
      { key: "height", label: "Height" },
      { key: "build", label: "Build" },
      { key: "hair", label: "Hair" },
      { key: "eyes", label: "Eyes" },
      { key: "skin", label: "Skin" },
      { key: "distinguishingFeatures", label: "Distinguishing Features" },
      { key: "clothing", label: "Clothing" },
      { key: "equipment", label: "Equipment" },
      { key: "voice", label: "Voice" },
      { key: "accent", label: "Accent" },
    ],
  },
  {
    id: "personalityAndMotivation",
    label: "Personality & Motivation",
    shortLabel: "Personality",
    icon: "fas fa-brain",
    fields: [
      { key: "personality", label: "Personality" },
      { key: "mannerisms", label: "Mannerisms" },
      { key: "goal", label: "Goal" },
      { key: "fear", label: "Fear" },
      { key: "ideal", label: "Ideal" },
      { key: "bond", label: "Bond" },
      { key: "flaw", label: "Flaw" },
    ],
  },
  {
    id: "relationships",
    label: "Relationships",
    shortLabel: "Relationships",
    icon: "fas fa-users",
    fields: [
      { key: "family", label: "Family" },
      { key: "allies", label: "Allies" },
      { key: "enemies", label: "Enemies" },
      { key: "rivals", label: "Rivals" },
      { key: "organizations", label: "Organizations" },
      { key: "employer", label: "Employer" },
      { key: "mentorStudent", label: "Mentor / Student" },
    ],
  },
  {
    id: "secretsAndStory",
    label: "Secrets & Story",
    shortLabel: "Secrets",
    icon: "fas fa-mask",
    fields: [
      { key: "secret", label: "Secret" },
      { key: "rumor", label: "Rumor" },
      { key: "hiddenAgenda", label: "Hidden Agenda" },
      { key: "currentProblem", label: "Current Problem" },
      { key: "adventureHook", label: "Adventure Hook" },
    ],
  },
  {
    id: "history",
    label: "History",
    shortLabel: "History",
    icon: "fas fa-book-open",
    fields: [
      { key: "publicHistory", label: "Public History" },
      { key: "privateHistory", label: "Private History" },
      { key: "gmNotes", label: "GM Notes" },
    ],
  },
  {
    id: "gameplay",
    label: "Gameplay",
    shortLabel: "Gameplay",
    icon: "fas fa-dice-d20",
    fields: [
      { key: "role", label: "NPC Role" },
      { key: "disposition", label: "Disposition" },
      { key: "currentStatus", label: "Current Status" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Test-safe ApplicationV2 base
// ---------------------------------------------------------------------------

const _TestSafeBase = class {
  static DEFAULT_OPTIONS = {};
  readonly rendered = false;
  readonly element: HTMLElement = document.createElement("div");
  render(_o?: boolean | { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  close(_o?: { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  bringToFront(): void { return; }
  async _renderHTML(_c: Record<string, unknown>, _o: unknown): Promise<HTMLElement> { return document.createElement("div"); }
  _replaceHTML(_r: HTMLElement, _c: HTMLElement, _o: unknown): void { return; }
  _onClickAction(_e: PointerEvent, _t: HTMLElement): void { return; }
} as unknown as typeof FoundryApplicationV2;

const _AppBase: typeof FoundryApplicationV2 = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: { ApplicationV2?: typeof FoundryApplicationV2 } } };
  }
).foundry?.applications?.api?.ApplicationV2 ?? _TestSafeBase;

// ---------------------------------------------------------------------------
// Backend helper
// ---------------------------------------------------------------------------

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function postBackend<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Status / escape helpers
// ---------------------------------------------------------------------------

function sectionHasContent(data: Record<string, string> | undefined): boolean {
  if (!data) return false;
  return Object.values(data).some(v => v && v.trim().length > 0);
}

function sectionStatus(data: Record<string, string> | undefined, fields: FieldMeta[]): "empty" | "partial" | "full" {
  if (!data) return "empty";
  const filled = fields.filter(f => (data[f.key] ?? "").trim().length > 0).length;
  if (filled === 0) return "empty";
  if (filled < fields.length) return "partial";
  return "full";
}

function statusIcon(status: "empty" | "partial" | "full"): string {
  if (status === "full") return "✅";
  if (status === "partial") return "⚠";
  return "❌";
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Gender / Presentation select helpers
// ---------------------------------------------------------------------------

const GENDER_IDENTITY_OPTIONS = ["Male", "Female", "Nonbinary", "Genderfluid", "Agender"];
const GENDER_PRESENTATION_OPTIONS = ["Masculine", "Feminine", "Androgynous", "Neutral"];

function buildGenderSelectHtml(f: FieldMeta, value: string): string {
  const opts = f.editType === "gender" ? GENDER_IDENTITY_OPTIONS : GENDER_PRESENTATION_OPTIONS;
  const isPreset = opts.includes(value);
  const isCustom = value !== "" && !isPreset;
  const selectVal = isPreset ? value : (isCustom ? "__custom__" : "");
  const placeholder = f.editType === "gender" ? "Type gender identity…" : "Type presentation style…";
  return `<select class="lb-gender-select" data-lb-field="${f.key}">
    <option value=""${selectVal === "" ? " selected" : ""}>Unspecified / Random</option>
    ${opts.map(o => `<option value="${o}"${selectVal === o ? " selected" : ""}>${o}</option>`).join("")}
    <option value="__custom__"${isCustom ? " selected" : ""}>Other / Custom…</option>
  </select><input type="text" class="lb-gender-custom" name="${f.key}" data-lb-field="${f.key}" placeholder="${placeholder}" value="${escHtml(isCustom ? value : "")}" style="${isCustom ? "" : "display:none;"}">`;
}

function readGenderFieldValue(container: Element, fieldKey: string): string {
  const select = container.querySelector<HTMLSelectElement>(`select[data-lb-field="${fieldKey}"]`);
  if (!select) return "";
  if (select.value === "__custom__") {
    return container.querySelector<HTMLInputElement>(`input[data-lb-field="${fieldKey}"]`)?.value.trim() ?? "";
  }
  return select.value;
}

function setupGenderSelectListeners(root: Element): void {
  root.querySelectorAll<HTMLSelectElement>(".lb-gender-select").forEach(select => {
    select.addEventListener("change", () => {
      const fieldKey = select.dataset["lbField"] ?? "";
      const customInput = root.querySelector<HTMLInputElement>(`input[data-lb-field="${fieldKey}"]`);
      if (!customInput) return;
      const isCustom = select.value === "__custom__";
      customInput.style.display = isCustom ? "" : "none";
      if (!isCustom) customInput.value = "";
    });
  });
}

// ---------------------------------------------------------------------------
// Shared profile I/O via actor flags
// ---------------------------------------------------------------------------

function getProfile(actor: FoundryActor): NpcProfileSections {
  return (actor.getFlag("lorebridge", "npcProfile") as NpcProfileSections | undefined) ?? {};
}

// Write generated values back to native dnd5e actor fields so the stock
// sheet stays in sync without the GM needing to copy-paste.
async function syncToNativeFields(actor: FoundryActor, section: NpcSection, data: Record<string, string>): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (section === "overview") {
    if (data["alignment"]) updates["system.details.alignment"] = data["alignment"];
    // Languages go to the custom sub-field to avoid clobbering selected language tags.
    if (data["languages"]) updates["system.traits.languages.custom"] = data["languages"];
  }

  if (section === "personalityAndMotivation") {
    if (data["ideal"]) updates["system.details.ideal"] = data["ideal"];
    if (data["bond"])  updates["system.details.bond"]  = data["bond"];
    if (data["flaw"])  updates["system.details.flaw"]  = data["flaw"];
  }

  if (section === "gameplay") {
    // Map text disposition to the Foundry token disposition constant.
    if (data["disposition"]) {
      const d = data["disposition"].toLowerCase();
      // CONST.TOKEN_DISPOSITIONS: HOSTILE=-1, NEUTRAL=0, FRIENDLY=1, SECRET=-2
      const num = d.includes("friendly") ? 1 : d.includes("hostile") ? -1 : d.includes("secret") ? -2 : 0;
      updates["prototypeToken.disposition"] = num;
    }
  }

  if (section === "history") {
    if (data["publicHistory"]) {
      updates["system.details.biography.public"] = `<p>${data["publicHistory"]}</p>`;
    }
    const privParts: string[] = [];
    if (data["privateHistory"]) privParts.push(`<h3>History</h3><p>${data["privateHistory"]}</p>`);
    if (data["gmNotes"])        privParts.push(`<h3>GM Notes</h3><p>${data["gmNotes"]}</p>`);
    if (privParts.length > 0)  updates["system.details.biography.value"] = privParts.join("\n");
  }

  if (Object.keys(updates).length === 0) return;
  await (actor as unknown as { update(d: Record<string, unknown>): Promise<void> }).update(updates);
}

async function persistSection(actor: FoundryActor, section: NpcSection, data: Record<string, string>): Promise<void> {
  const profile = getProfile(actor);
  profile[section] = data;
  await actor.setFlag("lorebridge", "npcProfile", profile);
  await syncToNativeFields(actor, section, data);
  if (section === "appearance") {
    const overview = (profile.overview ?? {}) as Record<string, string>;
    const genderData = (profile.gender ?? {}) as Record<string, string>;
    const pres = genderData["genderPresentation"] ? `${genderData["genderPresentation"]} presentation` : "";
    const parts = [overview["race"], pres, data["height"], data["build"], data["hair"], data["eyes"], data["clothing"]]
      .filter(Boolean).join(", ");
    if (parts) await actor.setFlag("lorebridge", "portraitDescription", parts);
  }
}

function getBiography(actor: FoundryActor): string {
  const raw = (actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
  return raw.replace(/<[^>]+>/g, "").slice(0, 1000);
}

async function generateSection(actor: FoundryActor, section: NpcSection): Promise<void> {
  const profile = getProfile(actor);
  const result = await postBackend<{ section: NpcSection; data: NpcProfileSections; provider: string }>(
    "v1/generate/npc-profile-section",
    {
      section,
      actorName: actor.name ?? "",
      actorBiography: getBiography(actor),
      existingProfile: profile as Record<string, unknown>,
      tone: "neutral",
      worldName: game.world?.title ?? "",
    },
  );
  const sectionData = (result.data[section] ?? {}) as Record<string, string>;
  await persistSection(actor, section, sectionData);

  const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
  const summary = Object.entries(sectionData).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  void addHistoryEntry({
    type: "npc-profile",
    label: `NPC Profile — ${actor.name ?? ""} / ${meta.label}`,
    prompt: `Section: ${section}`,
    content: summary,
  });
}

// ---------------------------------------------------------------------------
// ===========================================================================
// INLINE SHEET PANEL — embedded directly in the NPC actor sheet
// ===========================================================================
// ---------------------------------------------------------------------------

const PANEL_ID = "lb-npc-profile-panel";

// Detect Foundry's active color scheme.
// Foundry v14 stores the UI color scheme in game.settings.get("core", "uiConfig")
// as { colorScheme: { applications: "dark" | "light" | "" } }.
// (Tip sourced from Tidy 5e Sheets — github.com/kgar/foundry-vtt-tidy-5e-sheets)
function detectDarkMode(): boolean {
  // 1. Foundry v14 uiConfig — the authoritative source.
  try {
    type UiConfig = { colorScheme?: { applications?: string } };
    const uiConfig = (game.settings as unknown as { get(m: string, k: string): UiConfig })
      .get("core", "uiConfig");
    const scheme = uiConfig?.colorScheme?.applications ?? "";
    if (scheme === "dark") return true;
    if (scheme === "light") return false;
    // "" means "browser default" — fall through
  } catch { /* uiConfig not available (older Foundry or not yet initialised) */ }

  // 2. Legacy Foundry setting key used in earlier v14 builds.
  try {
    const scheme = (game.settings as unknown as { get(m: string, k: string): string })
      .get("core", "colorScheme");
    if (scheme === "dark") return true;
    if (scheme === "light") return false;
  } catch { /* key not registered */ }

  // 3. System preference (used when "Browser Default" is selected).
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Apply theme colours as inline styles so they beat dnd5e's parchment CSS
// unconditionally — inline styles win over every stylesheet rule.
function applyPanelThemeStyles(panel: HTMLElement, dark: boolean): void {
  const bg1     = dark ? "#2a2a2a" : "#e8e3d8";
  const bg2     = dark ? "#252525" : "#f0ebe0";
  const bg1h    = dark ? "#333333" : "#ddd8c8";
  const bg2h    = dark ? "#303030" : "#e8e3d8";
  const border  = dark ? "#555555" : "#aaaaaa";
  const border2 = dark ? "#3a3a3a" : "#cccccc";
  const text    = dark ? "#c9c7b8" : "#191813";
  const muted   = dark ? "#999999" : "#555555";

  panel.style.setProperty("color", text);

  const hdr = panel.querySelector<HTMLElement>(".lb-panel__header");
  if (hdr) {
    hdr.style.setProperty("background", bg1);
    hdr.style.setProperty("border-color", border);
    hdr.onmouseenter = () => hdr.style.setProperty("background", bg1h);
    hdr.onmouseleave = () => hdr.style.setProperty("background", bg1);
  }

  panel.querySelectorAll<HTMLElement>(".lb-sec").forEach(el =>
    el.style.setProperty("border-bottom-color", border2));

  panel.querySelectorAll<HTMLElement>(".lb-sec__header").forEach(el => {
    el.style.setProperty("background", bg2);
    el.onmouseenter = () => el.style.setProperty("background", bg2h);
    el.onmouseleave = () => el.style.setProperty("background", bg2);
  });

  panel.querySelectorAll<HTMLElement>(".lb-sec__content").forEach(el =>
    el.style.setProperty("background", "transparent"));

  panel.querySelectorAll<HTMLElement>(".lb-sec__btn:not(.lb-sec__btn--primary)").forEach(el => {
    el.style.setProperty("background", bg1);
    el.style.setProperty("border-color", border);
    el.style.setProperty("color", text);
    el.onmouseenter = () => el.style.setProperty("background", bg1h);
    el.onmouseleave = () => el.style.setProperty("background", bg1);
  });

  panel.querySelectorAll<HTMLElement>(".lb-sec__value").forEach(el =>
    el.style.setProperty("color", text));
  panel.querySelectorAll<HTMLElement>(".lb-sec__label, .lb-sec__empty, .lb-sec__field-label").forEach(el =>
    el.style.setProperty("color", muted));
}

const PANEL_STYLES = `
<style id="lb-npc-profile-styles">
  /* Layout — theme-neutral */
  #lb-npc-profile-panel {
    margin-top: 8px;
    font-size: 0.82em;
  }
  .lb-panel__header {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; cursor: pointer; user-select: none;
    border-top: 2px solid; border-bottom: 1px solid;
  }
  .lb-panel__title { flex: 1; font-weight: bold; font-size: 0.9em; }
  .lb-panel__toggle { font-size: 0.75em; opacity: 0.6; }
  .lb-panel__gen-all, .lb-panel__gen-gendered {
    padding: 2px 8px; border: 1px solid #3a5e9e; border-radius: 3px;
    background: #4e7ac7; color: #fff; cursor: pointer; font-size: 0.78em; white-space: nowrap;
  }
  .lb-panel__gen-gendered { background: #5a7a4e; border-color: #3a5e30; }
  .lb-panel__gen-all:hover:not(:disabled) { background: #3a5e9e; }
  .lb-panel__gen-gendered:hover:not(:disabled) { background: #3a5e30; }
  .lb-panel__gen-all:disabled, .lb-panel__gen-gendered:disabled { opacity: 0.5; cursor: not-allowed; }
  .lb-panel__body { padding: 4px 0; }
  .lb-panel__body.hidden { display: none; }
  .lb-sec { border-bottom: 1px solid; }
  .lb-sec__header { display: flex; align-items: center; gap: 5px; padding: 4px 8px; cursor: pointer; }
  .lb-sec__status { width: 16px; text-align: center; flex-shrink: 0; }
  .lb-sec__icon { opacity: 0.6; flex-shrink: 0; }
  .lb-sec__name { flex: 1; font-weight: bold; }
  .lb-sec__actions { display: flex; gap: 3px; }
  .lb-sec__btn {
    padding: 1px 6px; border: 1px solid; border-radius: 3px;
    cursor: pointer; font-size: 0.76em; white-space: nowrap;
  }
  .lb-sec__btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .lb-sec__btn--primary { background: #4e7ac7 !important; color: #fff !important; border-color: #3a5e9e !important; }
  .lb-sec__btn--primary:hover:not(:disabled) { background: #3a5e9e !important; }
  .lb-sec__content { padding: 4px 8px 6px; display: none; }
  .lb-sec__content.open { display: block; }
  .lb-sec__empty { font-style: italic; padding: 2px 0; }
  .lb-sec__fields { display: grid; grid-template-columns: 130px 1fr; gap: 2px 8px; }
  .lb-sec__label { font-size: 0.9em; }
  .lb-sec__value { font-size: 0.9em; line-height: 1.4; }
  .lb-sec__edit-form { display: flex; flex-direction: column; gap: 3px; }
  .lb-sec__field-row { display: flex; flex-direction: column; gap: 1px; }
  .lb-sec__field-label { font-size: 0.8em; }
  .lb-sec__textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 36px; font-size: 0.85em; }
  .lb-sec__edit-actions { display: flex; gap: 4px; margin-top: 4px; }
  .lb-sec__spinner { display: inline-block; animation: lb-spin 1s linear infinite; }
  @keyframes lb-spin { to { transform: rotate(360deg); } }
  .lb-gender-select { width: 100%; font-size: 0.85em; margin-bottom: 2px; }
  .lb-gender-custom { width: 100%; box-sizing: border-box; font-size: 0.85em; margin-top: 2px; }

  /* === DARK theme — !important beats dnd5e parchment overrides === */
  #lb-npc-profile-panel[data-lb-theme="dark"] {
    color: #c9c7b8 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-panel__header {
    background: #2a2a2a !important; border-color: #555 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-panel__header:hover { background: #333 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec { border-bottom-color: #3a3a3a !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__header { background: #252525 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__header:hover { background: #303030 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__btn {
    background: #2a2a2a !important; border-color: #555 !important; color: #c9c7b8 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__btn:hover:not(:disabled) { background: #333 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__content { background: transparent !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__empty,
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__label,
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__value,
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__field-label { color: #999 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__value { color: #c9c7b8 !important; }

  /* === LIGHT theme — !important beats any inherited dark overrides === */
  #lb-npc-profile-panel[data-lb-theme="light"] {
    color: #191813 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-panel__header {
    background: #e8e3d8 !important; border-color: #aaa !important;
  }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-panel__header:hover { background: #ddd8c8 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec { border-bottom-color: #ccc !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__header { background: #f0ebe0 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__header:hover { background: #e8e3d8 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__btn {
    background: #f0ebe0 !important; border-color: #aaa !important; color: #191813 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__btn:hover:not(:disabled) { background: #e0dac8 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__content { background: transparent !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__empty,
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__label,
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__field-label { color: #555 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__value { color: #191813 !important; }
</style>`;

function buildSectionHtml(meta: SectionMeta, data: Record<string, string> | undefined): string {
  const status = sectionStatus(data, meta.fields);
  const icon = statusIcon(status);
  const hasData = sectionHasContent(data);

  const actionsHtml = hasData
    ? `<button class="lb-sec__btn" data-lb-action="regen-section" data-lb-section="${meta.id}" title="Regenerate ${meta.label}">
         <i class="fas fa-sync-alt"></i>
       </button>
       <button class="lb-sec__btn" data-lb-action="edit-section" data-lb-section="${meta.id}" title="Edit">
         <i class="fas fa-edit"></i>
       </button>`
    : `<button class="lb-sec__btn lb-sec__btn--primary" data-lb-action="gen-section" data-lb-section="${meta.id}">
         <i class="fas fa-magic"></i> Generate
       </button>
       <button class="lb-sec__btn" data-lb-action="edit-section" data-lb-section="${meta.id}" title="Set manually">
         <i class="fas fa-edit"></i>
       </button>`;

  let contentHtml: string;
  if (!hasData) {
    contentHtml = `<p class="lb-sec__empty">Not yet generated. Click Generate or the edit icon to set manually.</p>`;
  } else {
    const fieldRows = meta.fields
      .filter(f => (data?.[f.key] ?? "").trim())
      .map(f => `<span class="lb-sec__label">${f.label}</span><span class="lb-sec__value">${escHtml(data?.[f.key] ?? "")}</span>`)
      .join("");
    contentHtml = `<div class="lb-sec__fields">${fieldRows || `<p class="lb-sec__empty">—</p>`}</div>`;
  }

  return `
    <div class="lb-sec" data-lb-section="${meta.id}">
      <div class="lb-sec__header" data-lb-action="toggle-section" data-lb-section="${meta.id}">
        <span class="lb-sec__status">${icon}</span>
        <i class="${meta.icon} lb-sec__icon"></i>
        <span class="lb-sec__name">${meta.label}</span>
        <span class="lb-sec__actions">${actionsHtml}</span>
      </div>
      <div class="lb-sec__content" data-lb-content="${meta.id}">
        ${contentHtml}
      </div>
    </div>`;
}

function buildPanelHtml(actor: FoundryActor, collapsed: boolean): string {
  const profile = getProfile(actor);
  const sectionsHtml = SECTION_META.map(m => buildSectionHtml(m, profile[m.id])).join("");
  const theme = detectDarkMode() ? "dark" : "light";
  return `
    ${PANEL_STYLES}
    <div id="${PANEL_ID}" data-lb-actor="${actor.id}" data-lb-theme="${theme}">
      <div class="lb-panel__header" data-lb-action="toggle-panel">
        <span>🤖</span>
        <span class="lb-panel__title">LoreBridge NPC Profile</span>
        <button class="lb-panel__gen-all" data-lb-action="gen-all" title="Generate all sections including gender">
          <i class="fas fa-magic"></i> Generate Full
        </button>
        <button class="lb-panel__gen-gendered" data-lb-action="gen-all-hold-gender" title="Generate all sections except gender (keeps current gender settings)">
          <i class="fas fa-venus-mars"></i> Hold Gender
        </button>
        <span class="lb-panel__toggle">${collapsed ? "▶" : "▼"}</span>
      </div>
      <div class="lb-panel__body${collapsed ? " hidden" : ""}">
        ${sectionsHtml}
      </div>
    </div>`;
}

function findInsertTarget(frame: HTMLElement): HTMLElement | null {
  // Selectors for the dnd5e NPC biography tab in order of specificity.
  // dnd5e v4 (Foundry v14) uses ApplicationV2 PARTS: [data-application-part="biography"].
  // Older layouts used [data-tab="biography"].
  // No fallback to .window-content — if no biography tab, skip injection entirely.
  const candidates = [
    '[data-application-part="biography"]',
    '[data-tab="biography"]',
    '.tab.biography',
  ];
  for (const sel of candidates) {
    const el = frame.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

function injectProfilePanel(frame: HTMLElement, actor: FoundryActor): void {
  // Remove stale panel (re-renders replace it)
  frame.querySelector(`#${PANEL_ID}`)?.remove();
  frame.querySelector("#lb-npc-profile-styles")?.remove();

  const target = findInsertTarget(frame);
  if (!target) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = buildPanelHtml(actor, false);

  // Append at end of the target section
  target.appendChild(wrapper);

  const injected = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
  if (injected) applyPanelThemeStyles(injected, detectDarkMode());

  attachPanelListeners(frame, actor);
}

function refreshPanel(frame: HTMLElement, actor: FoundryActor): void {
  const panel = frame.querySelector(`#${PANEL_ID}`);
  if (!panel) return;

  const body = panel.querySelector(".lb-panel__body");
  const isCollapsed = body?.classList.contains("hidden") ?? false;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = buildPanelHtml(actor, isCollapsed);

  // Preserve open/collapsed state of individual sections
  const openSections = new Set<string>();
  panel.querySelectorAll(".lb-sec__content.open").forEach(el => {
    const section = (el as HTMLElement).dataset["lbContent"];
    if (section) openSections.add(section);
  });

  panel.replaceWith(...Array.from(wrapper.childNodes));

  // Restore open sections and re-apply inline theme styles
  const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
  if (newPanel) {
    openSections.forEach(section => {
      const contentEl = newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      contentEl?.classList.add("open");
    });
    applyPanelThemeStyles(newPanel, detectDarkMode());
  }

  attachPanelListeners(frame, actor);
}

function setGeneratingState(panel: HTMLElement, section: NpcSection, busy: boolean): void {
  const secEl = panel.querySelector<HTMLElement>(`[data-lb-section="${section}"].lb-sec`);
  if (!secEl) return;
  const header = secEl.querySelector<HTMLElement>(".lb-sec__header");
  if (!header) return;
  const statusEl = header.querySelector<HTMLElement>(".lb-sec__status");
  if (statusEl) statusEl.innerHTML = busy ? '<i class="fas fa-spinner lb-sec__spinner"></i>' : "";
  secEl.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = busy; });
}

function attachPanelListeners(frame: HTMLElement, actor: FoundryActor): void {
  const panel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    const target = (e.target as Element).closest<HTMLElement>("[data-lb-action]");
    if (!target) return;

    // Stop clicks on buttons from also triggering parent handlers
    if (target.tagName === "BUTTON" || target.closest("button")) e.stopPropagation();

    const action = target.dataset["lbAction"];
    const section = target.dataset["lbSection"] as NpcSection | undefined;

    if (action === "toggle-panel") {
      // Don't let button clicks inside header toggle the panel
      if ((e.target as Element).closest("button")) return;
      const body = panel.querySelector(".lb-panel__body");
      const toggle = panel.querySelector(".lb-panel__toggle");
      if (body) {
        const nowHidden = !body.classList.contains("hidden");
        body.classList.toggle("hidden", nowHidden);
        if (toggle) toggle.textContent = nowHidden ? "▶" : "▼";
      }
      return;
    }

    if (action === "toggle-section" && section) {
      // Don't toggle when clicking action buttons inside the header
      if ((e.target as Element).closest(".lb-sec__actions")) return;
      const content = panel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      content?.classList.toggle("open");
      return;
    }

    if ((action === "gen-section" || action === "regen-section") && section) {
      e.stopPropagation();
      void (async () => {
        const genAllBtn = panel.querySelector<HTMLButtonElement>(".lb-panel__gen-all");
        if (genAllBtn) genAllBtn.disabled = true;
        setGeneratingState(panel, section, true);
        try {
          await generateSection(actor, section);
          refreshPanel(frame, actor);
          const meta = SECTION_META.find(s => s.id === section)?.label ?? section;
          ui.notifications.info(`LoreBridge: ${meta} generated for ${actor.name ?? "NPC"}.`);
          // Auto-expand the section after generation
          const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
          if (newPanel) {
            const content = newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
            content?.classList.add("open");
          }
        } catch (err) {
          ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Generation failed."}`);
          setGeneratingState(panel, section, false);
          if (genAllBtn) genAllBtn.disabled = false;
        }
      })();
      return;
    }

    if (action === "gen-all" || action === "gen-all-hold-gender") {
      e.stopPropagation();
      const holdGender = action === "gen-all-hold-gender";
      void (async () => {
        // Disable both generate buttons for the duration
        panel.querySelectorAll<HTMLButtonElement>(".lb-panel__gen-all, .lb-panel__gen-gendered")
          .forEach(b => { b.disabled = true; });

        // Mark every target section as queued (⏳) upfront so the user sees
        // what's coming before the first section even starts.
        for (const meta of SECTION_META) {
          if (holdGender && meta.id === "gender") continue;
          const secEl = panel.querySelector<HTMLElement>(`[data-lb-section="${meta.id}"].lb-sec`);
          const statusEl = secEl?.querySelector<HTMLElement>(".lb-sec__status");
          if (statusEl) statusEl.textContent = "⏳";
          secEl?.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = true; });
        }

        let errCount = 0;
        for (const meta of SECTION_META) {
          if (holdGender && meta.id === "gender") continue;

          // Re-query panel each iteration — setGeneratingState needs a live reference.
          const livePanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
          if (!livePanel) break;
          setGeneratingState(livePanel, meta.id, true);

          try {
            await generateSection(actor, meta.id);
            // Mark done without a full refresh — just update the status icon.
            const p = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
            const statusEl = p?.querySelector<HTMLElement>(`[data-lb-section="${meta.id}"] .lb-sec__status`);
            if (statusEl) statusEl.innerHTML = "✅";
          } catch {
            errCount++;
            const p = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
            const statusEl = p?.querySelector<HTMLElement>(`[data-lb-section="${meta.id}"] .lb-sec__status`);
            if (statusEl) statusEl.innerHTML = "❌";
          }
        }

        const label = holdGender ? "Profile (gender preserved)" : "Full profile";
        if (errCount > 0) {
          ui.notifications.warn(`LoreBridge: ${label} generated with ${errCount} error(s).`);
        } else {
          ui.notifications.info(`LoreBridge: ${label} generated for ${actor.name ?? "NPC"}.`);
        }
        void addHistoryEntry({
          type: "npc-profile",
          label: `NPC ${label} — ${actor.name ?? ""}`,
          prompt: holdGender ? "Full profile generation (gender held)" : "Full profile generation",
          content: JSON.stringify(getProfile(actor), null, 2),
        });
        // Single full rebuild at the end to show all generated content.
        refreshPanel(frame, actor);
      })();
      return;
    }

    if (action === "edit-section" && section) {
      e.stopPropagation();
      const content = panel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      if (!content) return;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const profile = getProfile(actor);
      const sectionData = (profile[section] ?? {}) as Record<string, string>;

      content.classList.add("open");
      const fieldRows = meta.fields.map(f => {
        const val = sectionData[f.key] ?? "";
        const input = (f.editType === "gender" || f.editType === "presentation")
          ? buildGenderSelectHtml(f, val)
          : `<textarea class="lb-sec__textarea" name="${f.key}" rows="2">${escHtml(val)}</textarea>`;
        return `<div class="lb-sec__field-row"><label class="lb-sec__field-label">${f.label}</label>${input}</div>`;
      }).join("");

      content.innerHTML = `
        <form class="lb-sec__edit-form">
          ${fieldRows}
          <div class="lb-sec__edit-actions">
            <button type="button" class="lb-sec__btn lb-sec__btn--primary" data-lb-action="save-section" data-lb-section="${section}">
              <i class="fas fa-save"></i> Save
            </button>
            <button type="button" class="lb-sec__btn" data-lb-action="cancel-edit" data-lb-section="${section}">
              Cancel
            </button>
          </div>
        </form>`;
      setupGenderSelectListeners(content);
      return;
    }

    if (action === "save-section" && section) {
      e.stopPropagation();
      const content = panel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      if (!content) return;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const data: Record<string, string> = {};
      for (const f of meta.fields) {
        if (f.editType === "gender" || f.editType === "presentation") {
          data[f.key] = readGenderFieldValue(content, f.key);
        } else {
          const ta = content.querySelector<HTMLTextAreaElement>(`textarea[name="${f.key}"]`);
          data[f.key] = ta?.value.trim() ?? "";
        }
      }
      void persistSection(actor, section, data).then(() => {
        refreshPanel(frame, actor);
        const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
        if (newPanel) {
          newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`)?.classList.add("open");
        }
        ui.notifications.info(`LoreBridge: ${meta.label} saved.`);
      });
      return;
    }

    if (action === "cancel-edit" && section) {
      e.stopPropagation();
      refreshPanel(frame, actor);
      const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
      if (newPanel) {
        newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`)?.classList.add("open");
      }
      return;
    }
  });
}

// ---------------------------------------------------------------------------
// ===========================================================================
// WORKSPACE WINDOW — full editing window (opened from three-dots menu)
// ===========================================================================
// ---------------------------------------------------------------------------

function _buildNpcWorkspaceClass(windowTitle: string) {
  return class extends _AppBase {
    static override DEFAULT_OPTIONS = {
      id: "lorebridge-npc-workspace",
      classes: ["lorebridge-npc-workspace"],
      window: { title: windowTitle, resizable: true },
      position: { width: 720, height: 560 },
    };

    actorId: string = "";
    private _selectedSection: NpcSection = "overview";
    private _editMode = false;
    private _generatingSection: NpcSection | null = null;
    private _generatingFull = false;

    private _getActor(): FoundryActor | undefined {
      return game.actors.get(this.actorId) as FoundryActor | undefined;
    }

    override async _renderHTML(_context: Record<string, unknown>, _options: unknown): Promise<HTMLElement> {
      const actor = this._getActor();
      if (!actor) {
        const el = document.createElement("div");
        el.style.padding = "1rem";
        el.textContent = "Actor not found.";
        return el;
      }
      const profile = getProfile(actor);
      const section = this._selectedSection;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const sectionData = profile[section] ?? {};
      const isGenerating = this._generatingSection === section || this._generatingFull;
      const hasContent = sectionHasContent(sectionData);
      const isGeneratingAny = this._generatingSection !== null || this._generatingFull;

      const navItems = SECTION_META.map(s => {
        const d = profile[s.id];
        const st = sectionStatus(d, s.fields);
        const isActive = s.id === section;
        const isGen = this._generatingSection === s.id || this._generatingFull;
        return `
          <li class="lb-ws-nav__item${isActive ? " active" : ""}" data-action="selectSection" data-section="${s.id}">
            <span class="lb-ws-nav__status">${isGen ? '<i class="fas fa-spinner" style="animation:lb-ws-spin 1s linear infinite"></i>' : statusIcon(st)}</span>
            <span class="lb-ws-nav__label"><i class="${s.icon}"></i> ${s.shortLabel}</span>
          </li>`;
      }).join("");

      let sectionContent: string;
      if (isGenerating) {
        sectionContent = `<div class="lb-ws-generating"><i class="fas fa-spinner" style="animation:lb-ws-spin 1s linear infinite"></i> Generating ${meta.label}…</div>`;
      } else if (this._editMode) {
        const fieldRows = meta.fields.map(f => {
          const val = (sectionData as Record<string, string>)[f.key] ?? "";
          const input = (f.editType === "gender" || f.editType === "presentation")
            ? buildGenderSelectHtml(f, val)
            : `<textarea class="lb-ws-field__textarea" name="${f.key}" rows="2">${escHtml(val)}</textarea>`;
          return `<div class="lb-ws-field--edit"><label class="lb-ws-field__label">${f.label}</label>${input}</div>`;
        }).join("");
        sectionContent = `
          <form class="lb-ws-edit-form">
            ${fieldRows}
            <div class="lb-ws-edit-actions">
              <button type="button" class="lb-ws-btn lb-ws-btn--primary" data-action="saveSection"><i class="fas fa-save"></i> Save</button>
              <button type="button" class="lb-ws-btn" data-action="cancelEdit"><i class="fas fa-times"></i> Cancel</button>
            </div>
          </form>`;
      } else if (!hasContent) {
        sectionContent = `
          <div class="lb-ws-empty">
            <p class="lb-ws-empty__msg">No content yet for <strong>${meta.label}</strong>.</p>
            <button type="button" class="lb-ws-btn lb-ws-btn--primary" data-action="generateSection" data-section="${section}">
              <i class="fas fa-magic"></i> Generate ${meta.label}
            </button>
            <button type="button" class="lb-ws-btn" data-action="editSection">
              <i class="fas fa-edit"></i> Set Manually
            </button>
          </div>`;
      } else {
        const data = sectionData as Record<string, string>;
        const fieldRows = meta.fields
          .filter(f => (data[f.key] ?? "").trim())
          .map(f => `<div class="lb-ws-field__label">${f.label}</div><div class="lb-ws-field__value">${escHtml(data[f.key] ?? "")}</div>`)
          .join("");
        sectionContent = `<div class="lb-ws-fields">${fieldRows || "<p style='color:var(--color-text-light-tertiary)'>—</p>"}</div>`;
      }

      const sectionBar = (!isGenerating && !this._editMode) ? `
        <div class="lb-ws-section-actions">
          ${hasContent
            ? `<button type="button" class="lb-ws-btn" data-action="regenerateSection" data-section="${section}" ${isGeneratingAny ? "disabled" : ""}>
                 <i class="fas fa-sync-alt"></i> Regenerate
               </button>
               <button type="button" class="lb-ws-btn" data-action="editSection"><i class="fas fa-edit"></i> Edit</button>
               <button type="button" class="lb-ws-btn" data-action="copySection"><i class="fas fa-copy"></i> Copy</button>`
            : ""
          }
        </div>` : "";

      const portrait = actor.img ? `<img class="lb-ws-portrait" src="${actor.img}" alt="">` : "";

      const container = document.createElement("div");
      container.innerHTML = `
        <style>
          @keyframes lb-ws-spin { to { transform: rotate(360deg); } }
          .lorebridge-npc-workspace .window-content {
            display:flex; flex-direction:column; overflow:hidden; padding:0; height:100%;
          }
          .lb-ws { display:flex; flex:1; min-height:0; overflow:hidden; }
          .lb-ws-sidebar {
            width:160px; min-width:120px; flex-shrink:0; display:flex; flex-direction:column;
            border-right:1px solid var(--color-border-dark, #444);
            background:var(--color-bg-option, #252525);
          }
          .lb-ws-portrait { width:100%; max-height:100px; object-fit:cover; display:block; }
          .lb-ws-full-gen, .lb-ws-full-gen-gendered {
            display:block; width:calc(100% - 10px); margin:5px 5px 0; padding:4px;
            background:#4e7ac7; color:#fff; border:none; border-radius:3px;
            cursor:pointer; font-size:0.76em; text-align:center;
          }
          .lb-ws-full-gen-gendered { background:#5a7a4e; margin-top:3px; }
          .lb-ws-full-gen:hover:not(:disabled) { background:#3a5e9e; }
          .lb-ws-full-gen-gendered:hover:not(:disabled) { background:#3a5e30; }
          .lb-ws-full-gen:disabled, .lb-ws-full-gen-gendered:disabled { opacity:0.5; cursor:not-allowed; }
          .lb-ws-nav { list-style:none; margin:0; padding:0; flex:1; overflow-y:auto; }
          .lb-ws-nav__item {
            display:flex; align-items:center; gap:6px; padding:7px 8px;
            cursor:pointer; border-bottom:1px solid var(--color-border-dark, #3a3a3a);
          }
          .lb-ws-nav__item:hover { background:var(--color-bg-secondary, #333); }
          .lb-ws-nav__item.active { background:var(--color-bg-secondary, #2e2e2e); font-weight:bold; }
          .lb-ws-nav__status { width:16px; text-align:center; flex-shrink:0; font-size:0.85em; }
          .lb-ws-nav__label { font-size:0.82em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
          .lb-ws-content { flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; }
          .lb-ws-section-header {
            display:flex; align-items:center; justify-content:space-between;
            padding:6px 10px; border-bottom:1px solid var(--color-border-dark, #444);
            flex-shrink:0; background:var(--color-bg-secondary, #2a2a2a);
          }
          .lb-ws-section-header h3 { margin:0; font-size:0.9em; }
          .lb-ws-section-actions { display:flex; gap:4px; }
          .lb-ws-body { flex:1; min-height:0; overflow-y:auto; padding:10px 12px; }
          .lb-ws-fields { display:grid; grid-template-columns:130px 1fr; gap:4px 8px; }
          .lb-ws-field--edit { display:flex; flex-direction:column; gap:2px; margin-bottom:4px; }
          .lb-ws-field__label { font-size:0.78em; color:var(--color-text-light-tertiary, #999); font-weight:bold; padding-top:2px; }
          .lb-ws-field__value { font-size:0.86em; line-height:1.4; }
          .lb-ws-field__textarea { width:100%; box-sizing:border-box; resize:vertical; min-height:40px; font-size:0.85em; }
          .lb-ws-edit-form { display:flex; flex-direction:column; }
          .lb-ws-edit-actions { display:flex; gap:6px; margin-top:8px; }
          .lb-ws-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:10px; padding:20px; text-align:center; }
          .lb-ws-empty__msg { color:var(--color-text-light-tertiary, #999); font-size:0.9em; margin:0; }
          .lb-ws-generating { display:flex; align-items:center; justify-content:center; gap:8px; height:100%; font-size:0.9em; color:var(--color-text-light-tertiary, #999); }
          .lb-ws-btn {
            padding:3px 8px; border:1px solid var(--color-border-dark, #555); border-radius:3px;
            background:var(--color-bg-secondary, #2a2a2a); color:var(--color-text-primary, inherit);
            cursor:pointer; font-size:0.8em; white-space:nowrap;
          }
          .lb-ws-btn:hover:not(:disabled) { background:var(--color-bg-option, #333); }
          .lb-ws-btn:disabled { opacity:0.5; cursor:not-allowed; }
          .lb-ws-btn--primary { background:#4e7ac7; color:#fff; border-color:#3a5e9e; }
          .lb-ws-btn--primary:hover:not(:disabled) { background:#3a5e9e; }
        </style>
        <div class="lb-ws">
          <aside class="lb-ws-sidebar">
            ${portrait}
            <button type="button" class="lb-ws-full-gen" data-action="generateFull" ${isGeneratingAny ? "disabled" : ""}>
              <i class="fas fa-magic"></i> Generate Full
            </button>
            <button type="button" class="lb-ws-full-gen-gendered" data-action="generateFullHoldGender" ${isGeneratingAny ? "disabled" : ""}>
              <i class="fas fa-venus-mars"></i> Hold Gender
            </button>
            <ul class="lb-ws-nav">${navItems}</ul>
          </aside>
          <div class="lb-ws-content">
            <div class="lb-ws-section-header">
              <h3><i class="${meta.icon}"></i> ${meta.label}</h3>
              ${sectionBar}
            </div>
            <div class="lb-ws-body">${sectionContent}</div>
          </div>
        </div>`;
      return container;
    }

    override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
      content.replaceChildren(...Array.from(result.childNodes));
      setupGenderSelectListeners(content);
    }

    override _onClickAction(event: PointerEvent, target: HTMLElement): void | Promise<void> {
      const action = target.dataset["action"];
      const actor = this._getActor();
      if (!actor) return;

      if (action === "selectSection") {
        const section = target.dataset["section"] as NpcSection;
        if (section && section !== this._selectedSection) {
          this._selectedSection = section;
          this._editMode = false;
          void this.render({ force: true });
        }
        return;
      }
      if (action === "generateSection" || action === "regenerateSection") {
        const section = (target.dataset["section"] ?? this._selectedSection) as NpcSection;
        void this._doGenerate(section, actor);
        return;
      }
      if (action === "generateFull") { void this._doGenerateFull(actor, false); return; }
      if (action === "generateFullHoldGender") { void this._doGenerateFull(actor, true); return; }
      if (action === "editSection") { this._editMode = true; void this.render({ force: true }); return; }
      if (action === "cancelEdit") { this._editMode = false; void this.render({ force: true }); return; }
      if (action === "saveSection") { void this._doSaveEdit(actor); return; }
      if (action === "copySection") { void this._doCopy(actor); return; }
    }

    private async _doGenerate(section: NpcSection, actor: FoundryActor): Promise<void> {
      this._generatingSection = section;
      this._editMode = false;
      await this.render({ force: true });
      try {
        await generateSection(actor, section);
        const label = SECTION_META.find(s => s.id === section)?.label ?? section;
        ui.notifications.info(`LoreBridge: ${label} generated.`);
      } catch (err) {
        ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Generation failed."}`);
      } finally {
        this._generatingSection = null;
        await this.render({ force: true });
      }
    }

    private async _doGenerateFull(actor: FoundryActor, holdGender: boolean): Promise<void> {
      this._editMode = false;
      let errCount = 0;
      for (const meta of SECTION_META) {
        if (holdGender && meta.id === "gender") continue;
        // Show which section is actively spinning in the nav before each call.
        this._generatingSection = meta.id;
        await this.render({ force: true });
        try { await generateSection(actor, meta.id); } catch { errCount++; }
      }
      this._generatingSection = null;
      const label = holdGender ? "Profile (gender preserved)" : "Full NPC profile";
      if (errCount > 0) ui.notifications.warn(`LoreBridge: ${label} generated with ${errCount} error(s).`);
      else ui.notifications.info(`LoreBridge: ${label} generated.`);
      void addHistoryEntry({ type: "npc-profile", label: `NPC ${label} — ${actor.name ?? ""}`, prompt: holdGender ? "Full profile (gender held)" : "Full profile generation", content: JSON.stringify(getProfile(actor), null, 2) });
      await this.render({ force: true });
    }

    private async _doSaveEdit(actor: FoundryActor): Promise<void> {
      const form = this.element?.querySelector(".lb-ws-edit-form");
      if (!form) return;
      const meta = SECTION_META.find(s => s.id === this._selectedSection) ?? SECTION_META[0]!;
      const data: Record<string, string> = {};
      for (const f of meta.fields) {
        if (f.editType === "gender" || f.editType === "presentation") {
          data[f.key] = readGenderFieldValue(form, f.key);
        } else {
          const ta = form.querySelector<HTMLTextAreaElement>(`textarea[name="${f.key}"]`);
          data[f.key] = ta?.value.trim() ?? "";
        }
      }
      await persistSection(actor, this._selectedSection, data);
      this._editMode = false;
      await this.render({ force: true });
      ui.notifications.info(`LoreBridge: ${meta.label} saved.`);
    }

    private async _doCopy(actor: FoundryActor): Promise<void> {
      const profile = getProfile(actor);
      const meta = SECTION_META.find(s => s.id === this._selectedSection) ?? SECTION_META[0]!;
      const data = (profile[this._selectedSection] ?? {}) as Record<string, string>;
      const text = meta.fields.filter(f => data[f.key]).map(f => `${f.label}: ${data[f.key]}`).join("\n");
      if (!text) return;
      await navigator.clipboard.writeText(text);
      ui.notifications.info(`LoreBridge: ${meta.label} copied.`);
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _workspaceInstance: InstanceType<ReturnType<typeof _buildNpcWorkspaceClass>> | undefined;

export function openNpcWorkspace(actorId: string): void {
  const actor = game.actors.get(actorId) as FoundryActor | undefined;
  const title = actor ? `NPC Workspace — ${actor.name}` : "LoreBridge — NPC Workspace";

  if (_workspaceInstance?.rendered && _workspaceInstance.actorId === actorId) {
    _workspaceInstance.bringToFront();
    return;
  }
  if (_workspaceInstance?.rendered) void _workspaceInstance.close({ force: true });

  const WorkspaceClass = _buildNpcWorkspaceClass(title);
  const instance = new WorkspaceClass();
  instance.actorId = actorId;
  _workspaceInstance = instance;
  void instance.render({ force: true });
}

export function registerNpcProfileSheetSection(): void {
  Hooks.on("renderApplicationV2", (app: unknown) => {
    const appAny = app as { document?: FoundryActor; element?: HTMLElement };
    const actor = appAny.document;
    const frame = appAny.element;
    if (!actor || !frame) return;
    if (actor.type !== "npc") return;
    if (!game.user?.isGM) return;
    if (!getLoreBridgeSettings().uiButtonsEnabled) return;
    // dnd5e NPCActorSheet sets class "npc" on its element.
    // Sub-windows (Skill Proficiencies, etc.) do not have this class,
    // so this gates injection to only the main NPC actor sheet.
    if (!frame.classList.contains("npc")) return;
    injectProfilePanel(frame, actor);
  });
}

export function registerNpcWorkspaceMenuHook(): void {
  Hooks.on("getHeaderControlsActorSheetV2", (...args: unknown[]) => {
    const [app, controls] = args as [{ document?: FoundryActor }, unknown[]];
    if (!game.user?.isGM) return;
    const actor = app.document;
    if (!actor || actor.type !== "npc") return;
    if ((controls as Array<{ class?: string }>).some(c => c.class === "lorebridge-npc-workspace")) return;
    controls.push({
      label: "NPC Workspace",
      class: "lorebridge-npc-workspace",
      icon: "fas fa-robot",
      onClick: () => { openNpcWorkspace(actor.id); },
    });
  });
}
