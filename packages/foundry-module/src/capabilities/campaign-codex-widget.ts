/**
 * Campaign Codex NPC Dossier widget.
 *
 * Registers a structured NPC dossier widget with Campaign Codex when that
 * module is active and exposes a compatible widget API. LoreBridge continues
 * to work normally when Campaign Codex is absent or disabled.
 */

import type {
  NpcDossierData,
  NpcDossierGoal,
  NpcDossierRelationship,
  NpcDossierConditional,
  NpcDossierQa,
  NpcDossierKnowledge,
  NpcDossierSecret,
} from "@lorebridge/shared";
import { getLoreBridgeSettings } from "../settings.js";

export type { NpcDossierData };

// ---------------------------------------------------------------------------
// Campaign Codex API types
// ---------------------------------------------------------------------------

type CCWidgetConstructor = new (
  widgetId: string,
  initialData: unknown,
  document: unknown,
) => CCWidgetBase;

interface CCWidgetBase {
  readonly isGM: boolean;
  readonly widgetId: string;
  readonly document: unknown;
  getData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
  render(): Promise<string>;
  activateListeners(htmlElement: HTMLElement): Promise<void> | void;
  _refreshWidget(htmlElement?: HTMLElement | null): Promise<void>;
}

interface CampaignCodexApi {
  CampaignCodexWidget: CCWidgetConstructor;
  widgetManager: {
    widgetRegistry: Map<string, CCWidgetConstructor>;
  };
}

type CCModuleEntry = {
  active: boolean;
  api?: CampaignCodexApi;
  version?: string;
};

// ---------------------------------------------------------------------------
// Embedded CSS — injected once into document.head
// ---------------------------------------------------------------------------

const DOSSIER_CSS = `
.lb-dossier {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 14px;
  line-height: 1.45;
}

/* Tab nav */
.lb-dos-nav {
  display: flex;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(214,173,69,0.22);
  margin-bottom: 12px;
  flex-shrink: 0;
}
.lb-dos-tab {
  padding: 4px 11px;
  background: transparent;
  border: 1px solid rgba(214,173,69,0.28);
  border-radius: 4px;
  color: #c9a84c;
  cursor: pointer;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.lb-dos-tab:hover { background: rgba(214,173,69,0.10); color: #d6ad45; }
.lb-dos-tab.active {
  background: rgba(214,173,69,0.16);
  border-color: rgba(214,173,69,0.55);
  color: #d6ad45;
}

/* Scrollable area */
.lb-dos-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
}

/* Section headings */
.lb-dos-section-heading {
  color: #d6ad45;
  margin: 14px 0 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(214,173,69,0.35);
  text-transform: uppercase;
  font-size: 14px;
  display: block;
}
.lb-dos-section-heading:first-child { margin-top: 0; }

/* Gold header banner */
.lb-dos-banner {
  margin: 0 0 14px;
  padding: 14px 16px;
  background: rgba(181,145,63,0.10);
  border-left: 4px solid #d6ad45;
}
.lb-dos-banner--blue {
  background: rgba(90,130,160,0.10);
  border-left-color: #6f9fbf;
}
.lb-dos-banner-title { font-weight: bold; color: #d6ad45; }
.lb-dos-banner-title--blue { color: #8eb9d4; }
.lb-dos-banner-sub { font-style: italic; }

/* Nickname bar (Info tab) */
.lb-dos-nickname-bar {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-left: 4px solid #d6b35a;
  background: rgba(214,179,90,0.08);
  font-size: 14px;
}
.lb-dos-nickname-label { color: #d6b35a; }

/* Status bar (Info tab) — mirrors .lb-dos-nickname-bar with status colour theming */
.lb-dos-status-bar {
  margin-bottom: 14px;
  padding: 10px 12px;
  font-size: 14px;
}
.lb-dos-status-bar-alive            { border-left: 4px solid #5aad68; background: rgba(70,160,80,0.08); }
.lb-dos-status-bar-dead             { border-left: 4px solid #c45050; background: rgba(180,50,50,0.08); }
.lb-dos-status-bar-ghost-active     { border-left: 4px solid #9b5fc0; background: rgba(150,90,200,0.08); }
.lb-dos-status-bar-ghost-rest       { border-left: 4px solid #7a6b8a; background: rgba(120,100,140,0.08); }
.lb-dos-status-bar-undead-active    { border-left: 4px solid #8fbc45; background: rgba(130,180,60,0.08); }
.lb-dos-status-bar-undead-destroyed { border-left: 4px solid #607080; background: rgba(80,100,110,0.08); }
.lb-dos-status-bar-unknown          { border-left: 4px solid #909090; background: rgba(140,140,140,0.08); }
.lb-dos-status-key-alive            { color: #5aad68; }
.lb-dos-status-key-dead             { color: #c45050; }
.lb-dos-status-key-ghost-active     { color: #9b5fc0; }
.lb-dos-status-key-ghost-rest       { color: #7a6b8a; }
.lb-dos-status-key-undead-active    { color: #8fbc45; }
.lb-dos-status-key-undead-destroyed { color: #607080; }
.lb-dos-status-key-unknown          { color: #909090; }

/* Fact table */
.lb-dos-fact-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 6px;
  table-layout: fixed;
  margin-bottom: 14px;
}
.lb-dos-fact-cell {
  padding: 10px;
  vertical-align: top;
  border: 1px solid rgba(214,173,69,0.35);
  background: rgba(255,255,255,0.035);
  border-radius: 5px;
}
.lb-dos-fact-cell-label {
  color: #d6ad45;
  font-weight: bold;
  font-size: 12px;
  text-transform: uppercase;
  display: block;
  margin-bottom: 3px;
}

/* Info/text boxes */
.lb-dos-text-box {
  padding: 12px 14px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(214,173,69,0.22);
  border-radius: 5px;
  margin-bottom: 14px;
  line-height: 1.5;
}
.lb-dos-text-box ul {
  margin: 0;
  padding-left: 20px;
  line-height: 1.55;
}
.lb-dos-text-box ul li { margin-bottom: 2px; }

/* Relationship notes */
.lb-dos-rel-name { color: #d6ad45; }

/* Knowledge / conditional cards (2-col table) */
.lb-dos-cond-trigger { display: block; color: #d6ad45; font-weight: 700; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.lb-dos-qa-question  { display: block; color: #8eb9d4; font-weight: 700; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.lb-dos-know-topic   { display: block; color: #a0c878; font-weight: 700; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
.lb-dos-secret-heading { display: block; color: #d6ad45; font-weight: 700; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }

/* Player knowledge box */
.lb-dos-pk-title { color: #d6ad45; font-weight: bold; margin-bottom: 5px; display: block; }

/* GM secret section heading (shown even when block is hidden) */
.lb-dos-gm-secrets-wrap { margin-top: 4px; }

/* Actions bar */
.lb-dos-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid rgba(214,173,69,0.15);
  margin-top: 10px;
  flex-shrink: 0;
}
.lb-dos-btn {
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.83rem;
  border: 1px solid rgba(214,173,69,0.35);
  background: transparent;
  color: #c9a84c;
}
.lb-dos-btn:hover { background: rgba(214,173,69,0.12); color: #d6ad45; }
.lb-dos-btn--primary {
  background: rgba(214,173,69,0.18);
  border-color: rgba(214,173,69,0.55);
  color: #d6ad45;
}
.lb-dos-btn--primary:hover { background: rgba(214,173,69,0.30); }
.lb-dos-btn--cancel { border-color: rgba(200,200,200,0.2); color: #909090; }
.lb-dos-btn:disabled { opacity: 0.5; cursor: default; }

/* Empty state */
.lb-dos-empty {
  color: rgba(200,189,168,0.5);
  font-style: italic;
  text-align: center;
  padding: 24px;
}

/* Edit form */
.lb-dos-edit-form { padding-bottom: 4px; }
.lb-dos-edit-heading {
  color: #d6ad45;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.07em;
  border-bottom: 1px solid rgba(214,173,69,0.25);
  padding-bottom: 4px;
  margin: 14px 0 8px;
  display: block;
}
.lb-dos-edit-heading:first-child { margin-top: 0; }
.lb-dos-field-group { margin-bottom: 7px; }
.lb-dos-field-label {
  display: block;
  font-size: 0.76rem;
  color: rgba(214,179,90,0.75);
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lb-dos-field-hint {
  font-size: 0.76rem;
  color: rgba(200,189,168,0.55);
  font-style: italic;
  margin: 0 0 5px;
}
.lb-dos-field-input,
.lb-dos-field-textarea,
.lb-dos-field-select {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(214,173,69,0.22);
  border-radius: 4px;
  color: #ece6d8;
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
}
.lb-dos-field-input:focus,
.lb-dos-field-textarea:focus { outline: none; border-color: rgba(214,173,69,0.55); }
.lb-dos-field-textarea { resize: vertical; line-height: 1.45; }
.lb-dos-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.lb-dos-grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
.lb-dos-grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }

/* Repeatable rows */
.lb-dos-repeatable { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.lb-dos-repeatable-row {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(214,173,69,0.15);
  border-radius: 4px;
  padding: 6px;
}
.lb-dos-repeat-fields { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.lb-dos-remove-row {
  background: none;
  border: none;
  color: rgba(200,189,168,0.35);
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.82rem;
  flex-shrink: 0;
}
.lb-dos-remove-row:hover { color: #e5aaa0; background: rgba(120,45,38,0.2); }
.lb-dos-add-row {
  background: none;
  border: 1px dashed rgba(214,173,69,0.25);
  border-radius: 4px;
  color: rgba(214,173,69,0.55);
  cursor: pointer;
  padding: 4px 10px;
  font-size: 0.8rem;
  width: 100%;
  text-align: center;
}
.lb-dos-add-row:hover { border-color: rgba(214,173,69,0.5); color: #d6ad45; background: rgba(214,173,69,0.06); }
`;

let _cssInjected = false;
function injectDossierStyles(): void {
  if (_cssInjected || document.getElementById("lb-npc-dossier-styles")) {
    _cssInjected = true;
    return;
  }
  _cssInjected = true;
  const style = document.createElement("style");
  style.id = "lb-npc-dossier-styles";
  style.textContent = DOSSIER_CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Default data factory
// ---------------------------------------------------------------------------

let _uidCounter = 0;
function uid(): string {
  return `lb-${Date.now()}-${++_uidCounter}`;
}

export function makeDefaultDossierData(): NpcDossierData {
  return {
    schemaVersion: 1,
    reference: {
      nicknames: "",
      status: "Alive",
      sourceBook: "",
      sourcePage: "",
      statBlockReference: "",
      statBlockAlterations: "",
      discoveryRegion: "",
      discoveryLocation: "",
    },
    identity: {
      occupationOrClass: "",
      race: "",
      sexOrGender: "",
      age: "",
      alignment: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      appearance: "",
    },
    overview: {
      playerKnowledgeTitle: "",
      playerKnowledge: "",
      profileTagline: "",
      bullets: [],
      relationships: [],
      secretsNarrative: "",
      secrets: [],
    },
    roleplay: {
      tagline: "",
      firstImpression: "",
      personality: "",
      motivation: "",
      fear: "",
      mannerisms: "",
      voiceOrSpeech: "",
      conversationalApproach: "",
      atTheTable: "",
      goals: [],
    },
    conditionalInfo: [],
    qa: [],
    knowledge: [],
    knowledgeLimits: "",
  };
}

/** Merge saved data with defaults so missing fields don't cause errors. */
function normalizeDossierData(raw: unknown): NpcDossierData {
  const def = makeDefaultDossierData();
  if (!raw || typeof raw !== "object") return def;
  const r = raw as Record<string, unknown>;
  const ref = (r["reference"] as Record<string, unknown> | undefined) ?? {};
  const id  = (r["identity"]  as Record<string, unknown> | undefined) ?? {};
  const ov  = (r["overview"]  as Record<string, unknown> | undefined) ?? {};
  const rp  = (r["roleplay"]  as Record<string, unknown> | undefined) ?? {};

  return {
    schemaVersion: 1,
    reference: {
      nicknames:           str(ref["nicknames"]),
      status:              statusVal(ref["status"]),
      sourceBook:          str(ref["sourceBook"]),
      sourcePage:          str(ref["sourcePage"]),
      statBlockReference:  str(ref["statBlockReference"]),
      statBlockAlterations: str(ref["statBlockAlterations"]),
      discoveryRegion:     str(ref["discoveryRegion"]  ?? ref["mapReference"]),
      discoveryLocation:   str(ref["discoveryLocation"]),
    },
    identity: {
      occupationOrClass: str(id["occupationOrClass"]),
      race:              str(id["race"]),
      sexOrGender:       str(id["sexOrGender"]),
      age:               str(id["age"]),
      alignment:         str(id["alignment"]),
      height:            str(id["height"]),
      weight:            str(id["weight"]),
      eyes:              str(id["eyes"]),
      hair:              str(id["hair"]),
      appearance:        str(id["appearance"] ?? id["distinguishingFeatures"]),
    },
    overview: {
      playerKnowledgeTitle: str(ov["playerKnowledgeTitle"]),
      playerKnowledge:      str(ov["playerKnowledge"]),
      profileTagline:       str(ov["profileTagline"]),
      bullets:              arr(ov["bullets"]),
      relationships:        relArr(ov["relationships"]),
      secretsNarrative:     str(ov["secretsNarrative"]),
      secrets:              secretArr(ov["secrets"]),
    },
    roleplay: {
      tagline:              str(rp["tagline"] ?? rp["personalityAndDemeanor"]),
      firstImpression:      str(rp["firstImpression"]),
      personality:          str(rp["personality"]),
      motivation:           str(rp["motivation"]),
      fear:                 str(rp["fear"]),
      mannerisms:           str(rp["mannerisms"]),
      voiceOrSpeech:        str(rp["voiceOrSpeech"]),
      conversationalApproach: str(rp["conversationalApproach"]),
      atTheTable:           str(rp["atTheTable"] ?? rp["runningTheNpc"]),
      goals:                goalArr(rp["goals"]),
    },
    conditionalInfo: condArr(r["conditionalInfo"]),
    qa:              qaArr(r["qa"]),
    knowledge:       knowArr(r["knowledge"]),
    knowledgeLimits: str(r["knowledgeLimits"]),
  };
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
type NpcStatus = "Alive" | "Dead" | "Ghost (Active)" | "Ghost (At Rest)" | "Undead (Active)" | "Undead (Destroyed)" | "Unknown";
const STATUS_VALUES: readonly NpcStatus[] = ["Alive", "Dead", "Ghost (Active)", "Ghost (At Rest)", "Undead (Active)", "Undead (Destroyed)", "Unknown"];
function statusVal(v: unknown): NpcStatus {
  if (STATUS_VALUES.includes(v as NpcStatus)) return v as NpcStatus;
  return "Alive";
}
const STATUS_KEY: Record<NpcStatus, string> = {
  "Alive":             "alive",
  "Dead":              "dead",
  "Ghost (Active)":    "ghost-active",
  "Ghost (At Rest)":   "ghost-rest",
  "Undead (Active)":   "undead-active",
  "Undead (Destroyed)":"undead-destroyed",
  "Unknown":           "unknown",
};
const STATUS_ICON: Record<NpcStatus, string> = {
  "Alive":             "💚",
  "Dead":              "☠️",
  "Ghost (Active)":    "👻",
  "Ghost (At Rest)":   "🕯️",
  "Undead (Active)":   "🧟",
  "Undead (Destroyed)":"💀",
  "Unknown":           "❓",
};
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function relArr(v: unknown): NpcDossierRelationship[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is NpcDossierRelationship =>
    x !== null && typeof x === "object" &&
    typeof (x as NpcDossierRelationship).id === "string" &&
    typeof (x as NpcDossierRelationship).name === "string"
  );
}
function secretArr(v: unknown): NpcDossierSecret[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is NpcDossierSecret =>
    x !== null && typeof x === "object" &&
    typeof (x as NpcDossierSecret).id === "string"
  );
}
function goalArr(v: unknown): NpcDossierGoal[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is NpcDossierGoal =>
    x !== null && typeof x === "object" &&
    typeof (x as NpcDossierGoal).id === "string"
  );
}
function condArr(v: unknown): NpcDossierConditional[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is NpcDossierConditional =>
    x !== null && typeof x === "object" &&
    typeof (x as NpcDossierConditional).id === "string"
  );
}
function qaArr(v: unknown): NpcDossierQa[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is NpcDossierQa =>
    x !== null && typeof x === "object" &&
    typeof (x as NpcDossierQa).id === "string"
  );
}
function knowArr(v: unknown): NpcDossierKnowledge[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is NpcDossierKnowledge =>
    x !== null && typeof x === "object" &&
    typeof (x as NpcDossierKnowledge).id === "string"
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function stripSecretBlocks(html: string): string {
  return html.replace(/<section[^>]+class="[^"]*secret[^"]*"[^>]*>[\s\S]*?<\/section>/gi, "").trim();
}

async function enrichText(html: string, isGM: boolean): Promise<string> {
  try {
    type TELike = { enrichHTML(c: string, o?: Record<string, unknown>): Promise<string> };
    const g = globalThis as unknown as Record<string, unknown>;
    // Foundry v14+ namespaced path; fall back to legacy global for v13
    const TE =
      ((g["foundry"] as Record<string, unknown> | undefined)
        ?.["applications"] as Record<string, unknown> | undefined)
        ?.["ux"] as { TextEditor?: { implementation?: TELike } } | undefined;
    const impl: TELike | undefined = TE?.TextEditor?.implementation ?? (g["TextEditor"] as TELike | undefined);
    if (impl?.enrichHTML) {
      return await impl.enrichHTML(html, { secrets: isGM, async: true });
    }
  } catch { /* Foundry not available */ }
  return isGM ? html : stripSecretBlocks(html);
}

// ---------------------------------------------------------------------------
// Context extraction — used by npc-workspace and npc-mention
// ---------------------------------------------------------------------------

export function getActorDossierCache(actor: FoundryActor): NpcDossierData | null {
  const raw = actor.getFlag("lorebridge", "dossierCache") as unknown;
  if (typeof raw !== "object" || raw === null) return null;
  return normalizeDossierData(raw);
}

export function getDossierSummaryText(dossier: NpcDossierData, isGM = true): string {
  const parts: string[] = [];
  const ref = dossier.reference;
  const id  = dossier.identity;
  const ov  = dossier.overview;
  const rp  = dossier.roleplay;

  if (ref.nicknames.trim()) parts.push(`Nicknames: ${ref.nicknames.trim()}`);
  parts.push(`Status: ${ref.status || "Alive"}`);
  if (ref.sourceBook.trim()) {
    const page = ref.sourcePage.trim() ? ` p.${ref.sourcePage.trim()}` : "";
    parts.push(`Source: ${ref.sourceBook.trim()}${page}`);
  }
  if (id.race.trim())  parts.push(`Race: ${id.race.trim()}`);
  if (id.age.trim())   parts.push(`Age: ${id.age.trim()}`);
  if (id.alignment.trim()) parts.push(`Alignment: ${id.alignment.trim()}`);
  if (id.occupationOrClass.trim()) parts.push(`Occupation: ${id.occupationOrClass.trim()}`);

  const bullets = ov.bullets.filter(b => b.trim()).slice(0, 6);
  if (bullets.length) parts.push(...bullets.map(b => `- ${b.trim()}`));

  if (isGM && ov.secretsNarrative.trim()) {
    const stripped = stripHtml(stripSecretBlocks(ov.secretsNarrative));
    if (stripped) parts.push(`[GM] Secrets: ${stripped}`);
  }

  if (rp.personality.trim())          parts.push(`Personality: ${rp.personality.trim()}`);
  if (rp.voiceOrSpeech.trim())        parts.push(`Voice: ${rp.voiceOrSpeech.trim()}`);
  if (rp.conversationalApproach.trim()) parts.push(`Conversational: ${rp.conversationalApproach.trim()}`);

  const goals = rp.goals.filter(g => g.goal.trim()).slice(0, 3);
  if (goals.length) parts.push(`Goals: ${goals.map(g => g.goal.trim()).join("; ")}`);

  const visibleQa = dossier.qa.filter(
    q => (isGM || q.visibility !== "secret") && q.question.trim() && q.answer.trim()
  ).slice(0, 5);
  for (const q of visibleQa) parts.push(`Q: ${q.question.trim()} → ${q.answer.trim()}`);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Linked actor
// ---------------------------------------------------------------------------

function tryGetLinkedActor(doc: unknown): FoundryActor | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  const sysId = (d["system"] as Record<string, unknown> | undefined)?.["actorId"];
  if (typeof sysId === "string") {
    const a = (game.actors as { get(id: string): FoundryActor | undefined }).get(sysId);
    if (a) return a;
  }
  const flagId = (
    (d["flags"] as Record<string, Record<string, unknown>> | undefined)?.["campaign-codex"]
  )?.["actorId"];
  if (typeof flagId === "string") {
    const a = (game.actors as { get(id: string): FoundryActor | undefined }).get(flagId);
    if (a) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

type DossierSection = "info" | "profile" | "roleplay" | "knowledge";

function sectionHeading(text: string): string {
  return `<span class="lb-dos-section-heading">${escHtml(text)}</span>`;
}

function editHeading(text: string): string {
  return `<span class="lb-dos-edit-heading">${escHtml(text)}</span>`;
}

function textField(name: string, label: string, value: string, placeholder = ""): string {
  return `<div class="lb-dos-field-group">
    <label class="lb-dos-field-label">${escHtml(label)}</label>
    <input type="text" class="lb-dos-field-input" name="${escHtml(name)}"
      value="${escHtml(value)}" placeholder="${escHtml(placeholder)}">
  </div>`;
}

function textArea(name: string, label: string, value: string, rows = 3, placeholder = ""): string {
  return `<div class="lb-dos-field-group">
    <label class="lb-dos-field-label">${escHtml(label)}</label>
    <textarea class="lb-dos-field-textarea" name="${escHtml(name)}"
      rows="${rows}" placeholder="${escHtml(placeholder)}">${escHtml(value)}</textarea>
  </div>`;
}

function selectField(name: string, label: string, value: string, options: { value: string; label: string }[]): string {
  const optHtml = options.map(o =>
    `<option value="${escHtml(o.value)}"${value === o.value ? " selected" : ""}>${escHtml(o.label)}</option>`
  ).join("");
  return `<div class="lb-dos-field-group">
    <label class="lb-dos-field-label">${escHtml(label)}</label>
    <select class="lb-dos-field-select" name="${escHtml(name)}">${optHtml}</select>
  </div>`;
}

function factCell(label: string, value: string): string {
  return `<td class="lb-dos-fact-cell">
    <span class="lb-dos-fact-cell-label">${escHtml(label)}</span>
    ${escHtml(value)}
  </td>`;
}

function factTable(rows: string[][]): string {
  if (!rows.length) return "";
  const rowsHtml = rows.map(cells =>
    `<tr>${cells.map(c => c).join("")}</tr>`
  ).join("");
  return `<table class="lb-dos-fact-table"><tbody>${rowsHtml}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// INFO TAB — read view
// ---------------------------------------------------------------------------

function renderInfoReadView(data: NpcDossierData): string {
  const ref = data.reference;
  const id  = data.identity;
  const ov  = data.overview;

  const status = statusVal(ref.status);
  const sk = STATUS_KEY[status];
  const statusHtml = `<div class="lb-dos-status-bar lb-dos-status-bar-${sk}"><span class="lb-dos-status-key-${sk}">Status:</span> ${STATUS_ICON[status]} ${escHtml(status)}</div>`;

  const nicknameHtml = ref.nicknames.trim()
    ? `<div class="lb-dos-nickname-bar"><span class="lb-dos-nickname-label">Nickname:</span> <em>"${escHtml(ref.nicknames)}"</em></div>`
    : "";

  // Identity table — 4 columns
  const identityRow = [
    id.occupationOrClass.trim() ? factCell("Occupation / Role", id.occupationOrClass) : "",
    id.race.trim()              ? factCell("Species", id.race) : "",
    id.sexOrGender.trim()       ? factCell("Gender", id.sexOrGender) : "",
    id.age.trim()               ? factCell("Age", id.age) : "",
  ].filter(Boolean);
  const identityHtml = identityRow.length
    ? `${sectionHeading("Identity")}${factTable([identityRow])}`
    : "";

  // Appearance table
  const heightWeight = [id.height.trim(), id.weight.trim()].filter(Boolean).join(" / ");
  const eyesHair     = [id.eyes.trim(), id.hair.trim()].filter(Boolean).join(" / ");
  const appearRow = [
    heightWeight    ? factCell("Height / Weight", heightWeight) : "",
    eyesHair        ? factCell("Eyes / Hair", eyesHair) : "",
    id.appearance.trim() ? factCell("Appearance", id.appearance) : "",
  ].filter(Boolean);
  const appearHtml = appearRow.length
    ? `${sectionHeading("Appearance")}${factTable([appearRow])}`
    : "";

  // Discovery table
  const discRow = [
    ref.discoveryRegion.trim()   ? factCell("Region Discovered", ref.discoveryRegion) : "",
    ref.discoveryLocation.trim() ? factCell("Location Discovered", ref.discoveryLocation) : "",
  ].filter(Boolean);
  const discHtml = discRow.length
    ? `${sectionHeading("Discovery")}${factTable([discRow])}`
    : "";

  // Player Knowledge box
  const pkHtml = ov.playerKnowledge.trim()
    ? `${sectionHeading("Player Knowledge")}
       <div class="lb-dos-text-box">
         ${ov.playerKnowledgeTitle.trim() ? `<span class="lb-dos-pk-title">${escHtml(ov.playerKnowledgeTitle)}</span>` : ""}
         ${escHtml(ov.playerKnowledge)}
       </div>`
    : "";

  if (!nicknameHtml && !identityHtml && !appearHtml && !discHtml && !pkHtml) {
    return `${statusHtml}<p class="lb-dos-empty">No additional info yet. Click Edit to begin.</p>`;
  }
  return `${nicknameHtml}${statusHtml}${identityHtml}${appearHtml}${discHtml}${pkHtml}`;
}

// ---------------------------------------------------------------------------
// INFO TAB — edit view
// ---------------------------------------------------------------------------

function renderInfoEditForm(data: NpcDossierData): string {
  const ref = data.reference;
  const id  = data.identity;
  const ov  = data.overview;
  return `<div class="lb-dos-edit-form">
    ${editHeading("Nickname / Status")}
    ${textField("nicknames", "Known As / Nickname", ref.nicknames)}
    ${selectField("status", "Status", statusVal(ref.status), STATUS_VALUES.map(s => ({ value: s, label: `${STATUS_ICON[s]} ${s}` })))}
    ${editHeading("Identity")}
    <div class="lb-dos-grid-2">
      ${textField("occupationOrClass", "Occupation / Role", id.occupationOrClass)}
      ${textField("race", "Species", id.race)}
      ${textField("sexOrGender", "Gender", id.sexOrGender)}
      ${textField("age", "Age", id.age)}
    </div>
    ${editHeading("Appearance")}
    <div class="lb-dos-grid-2">
      ${textField("height", "Height", id.height)}
      ${textField("weight", "Weight / Build", id.weight)}
      ${textField("eyes", "Eyes", id.eyes)}
      ${textField("hair", "Hair", id.hair)}
    </div>
    ${textArea("appearance", "Appearance Description", id.appearance, 2)}
    ${editHeading("Discovery")}
    <div class="lb-dos-grid-2">
      ${textField("discoveryRegion", "Region Discovered", ref.discoveryRegion)}
      ${textField("discoveryLocation", "Location Discovered", ref.discoveryLocation)}
    </div>
    ${editHeading("Player Knowledge")}
    ${textField("playerKnowledgeTitle", "Section Title", ov.playerKnowledgeTitle, "About [NPC Name]")}
    ${textArea("playerKnowledge", "Summary (visible to players)", ov.playerKnowledge, 3)}
  </div>`;
}

// ---------------------------------------------------------------------------
// PROFILE TAB — read view
// ---------------------------------------------------------------------------

async function renderProfileReadView(data: NpcDossierData, isGM: boolean, actorName: string): Promise<string> {
  const ref = data.reference;
  const ov  = data.overview;
  const id  = data.identity;

  // Banner
  const tagline = ov.profileTagline.trim();
  const bannerHtml = tagline
    ? `<div class="lb-dos-banner">
        <span class="lb-dos-banner-title">Profile:</span>
        <em class="lb-dos-banner-sub"> ${escHtml(tagline)}</em>
       </div>`
    : "";

  // Core Profile — 3 columns: alignment | source | known as
  const sourceLine = [
    ref.sourceBook.trim(),
    ref.sourcePage.trim() ? `p. ${ref.sourcePage.trim()}` : "",
  ].filter(Boolean).join(", ");
  const coreRow = [
    id.alignment.trim()   ? factCell("Alignment", id.alignment)         : "",
    sourceLine             ? factCell("Source", sourceLine)               : "",
    ref.nicknames.trim()   ? factCell("Known As", ref.nicknames)         : "",
    // Stat Block fields intentionally omitted from Profile read view
  ].filter(Boolean);
  const coreHtml = coreRow.length
    ? `${sectionHeading("Core Profile")}${factTable([coreRow])}`
    : "";

  // Overview bullets
  const bullets = ov.bullets.filter(b => b.trim());
  const overviewHtml = bullets.length
    ? `${sectionHeading("Overview")}
       <div class="lb-dos-text-box">
         <ul>${bullets.map(b => `<li>${escHtml(b)}</li>`).join("")}</ul>
       </div>`
    : "";

  // Relationship Notes
  const rels = ov.relationships.filter(r => r.name.trim() || r.description.trim());
  const relHtml = rels.length
    ? `${sectionHeading("Relationship Notes")}
       <div class="lb-dos-text-box">
         ${rels.map(r => {
           const name = r.name.trim();
           const desc = r.description.trim();
           return `<p>${name ? `<span class="lb-dos-rel-name">${escHtml(name)}:</span> ` : ""}${escHtml(desc)}</p>`;
         }).join("")}
       </div>`
    : "";

  // GM Secrets — each entry wrapped in a single Foundry secret block
  let secretsHtml = "";
  if (isGM) {
    const secretEntries = ov.secrets.filter(s => s.heading.trim() || s.text.trim());
    // Backward compat: fall back to old secretsNarrative if no structured entries
    if (secretEntries.length > 0) {
      const innerHtml = secretEntries.map(s =>
        `${s.heading.trim() ? `<p class="lb-dos-secret-heading">${escHtml(s.heading)}</p>` : ""}` +
        `${s.text.trim() ? `<p style="margin:0 0 8px">${escHtml(s.text)}</p>` : ""}`
      ).join("");
      const enriched = await enrichText(`<section class="secret">${innerHtml}</section>`, true);
      secretsHtml = `${sectionHeading("GM Secrets")}<div class="lb-dos-gm-secrets-wrap">${enriched}</div>`;
    } else if (ov.secretsNarrative.trim()) {
      const narrative = ov.secretsNarrative.trim();
      const wrapped = narrative.startsWith("<section") ? narrative : `<section class="secret">${narrative}</section>`;
      const enriched = await enrichText(wrapped, true);
      secretsHtml = `${sectionHeading("GM Secrets")}<div class="lb-dos-gm-secrets-wrap">${enriched}</div>`;
    }
  }

  const isEmpty = !bannerHtml && !coreHtml && !overviewHtml && !relHtml && !secretsHtml;
  if (isEmpty) return `<p class="lb-dos-empty">No profile data yet. Click Edit to begin.</p>`;

  return `${bannerHtml}${coreHtml}${overviewHtml}${relHtml}${secretsHtml}`;
}

// ---------------------------------------------------------------------------
// PROFILE TAB — edit view
// ---------------------------------------------------------------------------

function renderProfileEditForm(data: NpcDossierData, isGM: boolean): string {
  const ref = data.reference;
  const id  = data.identity;
  const ov  = data.overview;
  const bulletsText = ov.bullets.filter(b => b.trim()).join("\n");

  return `<div class="lb-dos-edit-form">
    ${editHeading("Profile Tagline")}
    ${textField("profileTagline", "One-Line Description", ov.profileTagline, "A kind but burdened young noble…")}
    ${editHeading("Core Profile")}
    <div class="lb-dos-grid-3">
      ${textField("alignment", "Alignment", id.alignment)}
      ${textField("sourceBook", "Source Book", ref.sourceBook)}
      ${textField("sourcePage", "Page", ref.sourcePage)}
    </div>
    ${editHeading("Overview Bullets")}
    <p class="lb-dos-field-hint">One bullet per line.</p>
    ${textArea("bullets", "Overview Bullets", bulletsText, 5)}
    ${editHeading("Relationship Notes")}
    <div class="lb-dos-repeatable" data-list="relationships">
      ${ov.relationships.map(r => renderRelationshipRow(r)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="relationships">
      <i class="fas fa-plus"></i> Add Relationship
    </button>
    ${isGM ? `
    ${editHeading("GM Secrets")}
    <p class="lb-dos-field-hint">Each entry becomes a Foundry secret block, hidden from players. Add one entry per distinct secret.</p>
    <div class="lb-dos-repeatable" data-list="secrets">
      ${ov.secrets.map(s => renderSecretRow(s)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="secrets">
      <i class="fas fa-plus"></i> Add Secret
    </button>
    ` : ""}
  </div>`;
}

function renderSecretRow(s: NpcDossierSecret): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(s.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="heading"
        placeholder="Secret heading (e.g. Ireena's Adoption)" value="${escHtml(s.heading)}">
      <textarea class="lb-dos-field-textarea" data-field="text"
        rows="3" placeholder="Secret details…">${escHtml(s.text)}</textarea>
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(s.id)}" title="Remove">
      <i class="fas fa-times"></i>
    </button>
  </div>`;
}

function renderRelationshipRow(r: NpcDossierRelationship): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(r.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="name"
        placeholder="Person's name" value="${escHtml(r.name)}">
      <textarea class="lb-dos-field-textarea" data-field="description"
        rows="2" placeholder="Relationship description">${escHtml(r.description)}</textarea>
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(r.id)}" title="Remove">
      <i class="fas fa-times"></i>
    </button>
  </div>`;
}

// ---------------------------------------------------------------------------
// ROLEPLAY TAB — read view
// ---------------------------------------------------------------------------

function renderRoleplayReadView(data: NpcDossierData, actorName: string): string {
  const rp = data.roleplay;

  // Banner
  const tagParts: string[] = [];
  if (actorName.trim()) tagParts.push(`Roleplaying ${actorName}`);
  const bannerHtml = `<div class="lb-dos-banner">
    <span class="lb-dos-banner-title">${escHtml(tagParts[0] ?? "Roleplaying")}${rp.tagline.trim() ? ":" : ""}</span>
    ${rp.tagline.trim() ? `<em class="lb-dos-banner-sub"> ${escHtml(rp.tagline)}</em>` : ""}
  </div>`;

  // First Impression
  const fiHtml = rp.firstImpression.trim()
    ? `${sectionHeading("First Impression")}
       <div class="lb-dos-text-box">${escHtml(rp.firstImpression)}</div>`
    : "";

  // Characterization 4-col
  const charRow = [
    rp.personality.trim() ? factCell("Personality", rp.personality) : "",
    rp.motivation.trim()  ? factCell("Motivation",  rp.motivation)  : "",
    rp.fear.trim()        ? factCell("Fear",        rp.fear)        : "",
    rp.mannerisms.trim()  ? factCell("Mannerisms",  rp.mannerisms)  : "",
  ].filter(Boolean);
  const charHtml = charRow.length
    ? `${sectionHeading("Characterization")}${factTable([charRow])}`
    : "";

  // Voice & Conversation 2-col
  const vcRow = [
    rp.voiceOrSpeech.trim()          ? factCell("Voice / Speech Guidance",  rp.voiceOrSpeech)          : "",
    rp.conversationalApproach.trim() ? factCell("Conversational Approach", rp.conversationalApproach) : "",
  ].filter(Boolean);
  const vcHtml = vcRow.length
    ? `${sectionHeading("Voice & Conversation")}${factTable([vcRow])}`
    : "";

  // At the Table bullets
  const atLines = rp.atTheTable.split("\n").map(l => l.trim()).filter(Boolean);
  const atHtml = atLines.length
    ? `${sectionHeading("At the Table")}
       <div class="lb-dos-text-box">
         <ul>${atLines.map(l => `<li>${escHtml(l)}</li>`).join("")}</ul>
       </div>`
    : "";

  // Goals
  const goals = rp.goals.filter(g => g.goal.trim());
  const goalsHtml = goals.length
    ? `${sectionHeading("Goals")}
       <div class="lb-dos-text-box">
         <ul>${goals.map(g =>
           `<li>${escHtml(g.goal)}${g.questReference.trim() ? ` <em>(Quest: ${escHtml(g.questReference)})</em>` : ""}</li>`
         ).join("")}</ul>
       </div>`
    : "";

  const hasContent = fiHtml || charHtml || vcHtml || atHtml || goalsHtml;
  return `${bannerHtml}${hasContent ? `${fiHtml}${charHtml}${vcHtml}${atHtml}${goalsHtml}` : `<p class="lb-dos-empty">No roleplay data yet. Click Edit to begin.</p>`}`;
}

// ---------------------------------------------------------------------------
// ROLEPLAY TAB — edit view
// ---------------------------------------------------------------------------

function renderRoleplayEditForm(data: NpcDossierData): string {
  const rp = data.roleplay;
  return `<div class="lb-dos-edit-form">
    ${editHeading("Header")}
    ${textField("tagline", "Tagline", rp.tagline, "An honest, exhausted ally who still chooses hope.")}
    ${editHeading("First Impression")}
    ${textArea("firstImpression", "First Impression", rp.firstImpression, 3)}
    ${editHeading("Characterization")}
    <div class="lb-dos-grid-2">
      ${textArea("personality", "Personality", rp.personality, 2)}
      ${textArea("motivation", "Motivation", rp.motivation, 2)}
      ${textArea("fear", "Fear", rp.fear, 2)}
      ${textArea("mannerisms", "Mannerisms", rp.mannerisms, 2)}
    </div>
    ${editHeading("Voice & Conversation")}
    ${textArea("voiceOrSpeech", "Voice / Speech Guidance", rp.voiceOrSpeech, 2)}
    ${textArea("conversationalApproach", "Conversational Approach", rp.conversationalApproach, 2)}
    ${editHeading("At the Table")}
    <p class="lb-dos-field-hint">One bullet per line.</p>
    ${textArea("atTheTable", "At the Table Bullets", rp.atTheTable, 4)}
    ${editHeading("Goals")}
    <div class="lb-dos-repeatable" data-list="goals">
      ${rp.goals.map(g => renderGoalRow(g)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="goals">
      <i class="fas fa-plus"></i> Add Goal
    </button>
  </div>`;
}

function renderGoalRow(g: NpcDossierGoal): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(g.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="goal"
        placeholder="Goal description" value="${escHtml(g.goal)}">
      <input type="text" class="lb-dos-field-input" data-field="questReference"
        placeholder="Quest reference (optional)" value="${escHtml(g.questReference)}">
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(g.id)}" title="Remove">
      <i class="fas fa-times"></i>
    </button>
  </div>`;
}

// ---------------------------------------------------------------------------
// KNOWLEDGE TAB — read view
// ---------------------------------------------------------------------------

function renderKnowledgeReadView(data: NpcDossierData, isGM: boolean, actorName: string): string {
  // Blue banner
  const bannerHtml = `<div class="lb-dos-banner lb-dos-banner--blue">
    <span class="lb-dos-banner-title lb-dos-banner-title--blue">Knowledge &amp; Responses:</span>
    <em class="lb-dos-banner-sub"> Information ${escHtml(actorName || "this NPC")} can provide and the conditions that unlock it.</em>
  </div>`;

  // Conditional Information — 2-col table
  const visibleCond = data.conditionalInfo.filter(c => isGM || c.visibility !== "secret");
  let condHtml = "";
  if (visibleCond.length) {
    const pairs: string[][] = [];
    for (let i = 0; i < visibleCond.length; i += 2) {
      const row: string[] = [];
      const makeCondCell = (c: NpcDossierConditional) =>
        `<td class="lb-dos-fact-cell" style="width:50%">
          <span class="lb-dos-cond-trigger">${escHtml(c.trigger)}</span>
          <p style="margin:0">${escHtml(c.response)}</p>
          ${c.consequence.trim() ? `<p style="font-style:italic;margin:4px 0 0">${escHtml(c.consequence)}</p>` : ""}
        </td>`;
      row.push(makeCondCell(visibleCond[i]!));
      if (visibleCond[i + 1]) row.push(makeCondCell(visibleCond[i + 1]!));
      pairs.push(row);
    }
    condHtml = `${sectionHeading("Conditional Information")}${factTable(pairs)}`;
  }

  // Q&A — 2-col table
  const visibleQa = data.qa.filter(q => isGM || q.visibility !== "secret");
  let qaHtml = "";
  if (visibleQa.length) {
    const pairs: string[][] = [];
    for (let i = 0; i < visibleQa.length; i += 2) {
      const row: string[] = [];
      const makeQaCell = (q: NpcDossierQa) =>
        `<td class="lb-dos-fact-cell" style="width:50%">
          <span class="lb-dos-qa-question">${escHtml(q.question)}</span>
          <p style="margin:0">${escHtml(q.answer)}</p>
        </td>`;
      row.push(makeQaCell(visibleQa[i]!));
      if (visibleQa[i + 1]) row.push(makeQaCell(visibleQa[i + 1]!));
      pairs.push(row);
    }
    qaHtml = `${sectionHeading("Likely Questions & Answers")}${factTable(pairs)}`;
  }

  // Reference Knowledge — 2-col: knowledge bullets | knowledge limits
  const knowledgeBullets = data.knowledge.filter(k => k.statement.trim());
  const hasRefKnow = knowledgeBullets.length || data.knowledgeLimits.trim();
  let refKnowHtml = "";
  if (hasRefKnow) {
    const bulletsCell = knowledgeBullets.length
      ? `<td class="lb-dos-fact-cell" style="width:50%">
          <span class="lb-dos-fact-cell-label">Other Knowledge</span>
          <div style="margin-top:4px">
            ${knowledgeBullets.map(k =>
              `<div style="margin-bottom:6px">
                ${k.topicOrCategory.trim() ? `<span class="lb-dos-know-topic">${escHtml(k.topicOrCategory)}</span>` : ""}
                <span>${escHtml(k.statement)}</span>
              </div>`
            ).join("")}
          </div>
         </td>`
      : "";
    const limitsCell = data.knowledgeLimits.trim()
      ? `<td class="lb-dos-fact-cell" style="width:50%">
          <span class="lb-dos-fact-cell-label">Knowledge Limits</span>
          ${escHtml(data.knowledgeLimits)}
         </td>`
      : "";
    if (bulletsCell || limitsCell) {
      refKnowHtml = `${sectionHeading("Reference Knowledge")}${factTable([[bulletsCell, limitsCell].filter(Boolean)])}`;
    }
  }

  const isEmpty = !condHtml && !qaHtml && !refKnowHtml;
  return `${bannerHtml}${isEmpty ? `<p class="lb-dos-empty">No knowledge data yet. Click Edit to begin.</p>` : `${condHtml}${qaHtml}${refKnowHtml}`}`;
}

// ---------------------------------------------------------------------------
// KNOWLEDGE TAB — edit view
// ---------------------------------------------------------------------------

function renderKnowledgeEditForm(data: NpcDossierData): string {
  return `<div class="lb-dos-edit-form">
    ${editHeading("Conditional Information")}
    <div class="lb-dos-repeatable" data-list="conditionalInfo">
      ${data.conditionalInfo.map(c => renderConditionalRow(c)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="conditionalInfo">
      <i class="fas fa-plus"></i> Add Conditional
    </button>
    ${editHeading("Questions & Answers")}
    <div class="lb-dos-repeatable" data-list="qa">
      ${data.qa.map(q => renderQaRow(q)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="qa">
      <i class="fas fa-plus"></i> Add Q&amp;A
    </button>
    ${editHeading("General Knowledge")}
    <p class="lb-dos-field-hint">Facts this NPC knows (shown in Other Knowledge).</p>
    <div class="lb-dos-repeatable" data-list="knowledge">
      ${data.knowledge.map(k => renderKnowledgeRow(k)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="knowledge">
      <i class="fas fa-plus"></i> Add Knowledge
    </button>
    ${editHeading("Knowledge Limits")}
    ${textArea("knowledgeLimits", "What this NPC does NOT know", data.knowledgeLimits, 3)}
  </div>`;
}

function renderConditionalRow(c: NpcDossierConditional): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(c.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="trigger"
        placeholder="Trigger condition (bold, shown first)" value="${escHtml(c.trigger)}">
      <textarea class="lb-dos-field-textarea" data-field="response"
        rows="2" placeholder="Response text">${escHtml(c.response)}</textarea>
      <select class="lb-dos-field-input lb-dos-field-select" data-field="visibility">
        ${(["normal", "conditional", "secret"] as const).map(v =>
          `<option value="${v}"${c.visibility === v ? " selected" : ""}>${v}</option>`
        ).join("")}
      </select>
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(c.id)}" title="Remove">
      <i class="fas fa-times"></i>
    </button>
  </div>`;
}

function renderQaRow(q: NpcDossierQa): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(q.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="question"
        placeholder="Question (shown in blue bold)" value="${escHtml(q.question)}">
      <textarea class="lb-dos-field-textarea" data-field="answer"
        rows="2" placeholder="Answer text">${escHtml(q.answer)}</textarea>
      <select class="lb-dos-field-input lb-dos-field-select" data-field="visibility">
        ${(["normal", "conditional", "secret"] as const).map(v =>
          `<option value="${v}"${q.visibility === v ? " selected" : ""}>${v}</option>`
        ).join("")}
      </select>
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(q.id)}" title="Remove">
      <i class="fas fa-times"></i>
    </button>
  </div>`;
}

function renderKnowledgeRow(k: NpcDossierKnowledge): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(k.id)}">
    <div class="lb-dos-repeat-fields">
      <textarea class="lb-dos-field-textarea" data-field="statement"
        rows="2" placeholder="Knowledge statement">${escHtml(k.statement)}</textarea>
      <input type="text" class="lb-dos-field-input" data-field="topicOrCategory"
        placeholder="Topic / Category" value="${escHtml(k.topicOrCategory)}">
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(k.id)}" title="Remove">
      <i class="fas fa-times"></i>
    </button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Form reading helpers
// ---------------------------------------------------------------------------

function readField(container: Element, name: string): string {
  return (
    (container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? "")
  ).trim();
}

function readRepeatableList<T>(container: Element, listName: string, readRow: (row: Element) => T | null): T[] {
  const items: T[] = [];
  container.querySelectorAll(`[data-list="${listName}"] [data-row-id]`).forEach(row => {
    const item = readRow(row);
    if (item) items.push(item);
  });
  return items;
}

function fieldVal(row: Element, field: string): string {
  return (
    (row.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[data-field="${field}"]`
    )?.value ?? "")
  ).trim();
}

function readRelationshipRow(row: Element): NpcDossierRelationship | null {
  const id   = row.getAttribute("data-row-id") ?? uid();
  const name = fieldVal(row, "name");
  const desc = fieldVal(row, "description");
  if (!name && !desc) return null;
  return { id, name, description: desc };
}

function readSecretRow(row: Element): NpcDossierSecret | null {
  const id      = row.getAttribute("data-row-id") ?? uid();
  const heading = fieldVal(row, "heading");
  const text    = fieldVal(row, "text");
  if (!heading && !text) return null;
  return { id, heading, text };
}

function readGoalRow(row: Element): NpcDossierGoal | null {
  const id   = row.getAttribute("data-row-id") ?? uid();
  const goal = fieldVal(row, "goal");
  if (!goal) return null;
  return { id, goal, questReference: fieldVal(row, "questReference") };
}

function readConditionalRow(row: Element): NpcDossierConditional | null {
  const id      = row.getAttribute("data-row-id") ?? uid();
  const trigger = fieldVal(row, "trigger");
  const response = fieldVal(row, "response");
  if (!trigger && !response) return null;
  return {
    id, trigger, response,
    consequence: fieldVal(row, "consequence"),
    relatedUuid: "",
    visibility: (fieldVal(row, "visibility") || "normal") as NpcDossierConditional["visibility"],
  };
}

function readQaRow(row: Element): NpcDossierQa | null {
  const id       = row.getAttribute("data-row-id") ?? uid();
  const question = fieldVal(row, "question");
  const answer   = fieldVal(row, "answer");
  if (!question && !answer) return null;
  return {
    id, question, answer,
    visibility: (fieldVal(row, "visibility") || "normal") as NpcDossierQa["visibility"],
    relatedSourceUuid: "",
  };
}

function readKnowledgeRow(row: Element): NpcDossierKnowledge | null {
  const id        = row.getAttribute("data-row-id") ?? uid();
  const statement = fieldVal(row, "statement");
  if (!statement) return null;
  return {
    id, statement,
    topicOrCategory: fieldVal(row, "topicOrCategory"),
    quality: "knows",
    sourceUuid: "",
  };
}

function readDossierFromForm(container: Element, section: DossierSection, current: NpcDossierData): NpcDossierData {
  const updated = JSON.parse(JSON.stringify(current)) as NpcDossierData;

  if (section === "info") {
    updated.reference = {
      ...updated.reference,
      nicknames:          readField(container, "nicknames"),
      status:             statusVal(readField(container, "status")),
      discoveryRegion:    readField(container, "discoveryRegion"),
      discoveryLocation:  readField(container, "discoveryLocation"),
    };
    updated.identity = {
      occupationOrClass: readField(container, "occupationOrClass"),
      race:              readField(container, "race"),
      sexOrGender:       readField(container, "sexOrGender"),
      age:               readField(container, "age"),
      alignment:         updated.identity.alignment, // alignment lives on profile tab
      height:            readField(container, "height"),
      weight:            readField(container, "weight"),
      eyes:              readField(container, "eyes"),
      hair:              readField(container, "hair"),
      appearance:        readField(container, "appearance"),
    };
    updated.overview = {
      ...updated.overview,
      playerKnowledgeTitle: readField(container, "playerKnowledgeTitle"),
      playerKnowledge:      readField(container, "playerKnowledge"),
    };
  } else if (section === "profile") {
    updated.reference = {
      ...updated.reference,
      sourceBook: readField(container, "sourceBook"),
      sourcePage: readField(container, "sourcePage"),
    };
    updated.identity = {
      ...updated.identity,
      alignment: readField(container, "alignment"),
    };
    const bulletsRaw = readField(container, "bullets");
    updated.overview = {
      ...updated.overview,
      profileTagline: readField(container, "profileTagline"),
      bullets:        bulletsRaw.split("\n").map(b => b.trim()).filter(Boolean),
      relationships:  readRepeatableList(container, "relationships", readRelationshipRow),
      secrets:        readRepeatableList(container, "secrets", readSecretRow),
    };
  } else if (section === "roleplay") {
    updated.roleplay = {
      tagline:              readField(container, "tagline"),
      firstImpression:      readField(container, "firstImpression"),
      personality:          readField(container, "personality"),
      motivation:           readField(container, "motivation"),
      fear:                 readField(container, "fear"),
      mannerisms:           readField(container, "mannerisms"),
      voiceOrSpeech:        readField(container, "voiceOrSpeech"),
      conversationalApproach: readField(container, "conversationalApproach"),
      atTheTable:           readField(container, "atTheTable"),
      goals:                readRepeatableList(container, "goals", readGoalRow),
    };
  } else if (section === "knowledge") {
    updated.conditionalInfo = readRepeatableList(container, "conditionalInfo", readConditionalRow);
    updated.qa              = readRepeatableList(container, "qa", readQaRow);
    updated.knowledge       = readRepeatableList(container, "knowledge", readKnowledgeRow);
    updated.knowledgeLimits = readField(container, "knowledgeLimits");
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Widget class factory — one section per widget, no internal tab navigation
// ---------------------------------------------------------------------------

export function createSectionWidget(
  section: DossierSection,
  CampaignCodexWidget: CCWidgetConstructor,
): CCWidgetConstructor {
  class DossierSectionWidget extends (CampaignCodexWidget as abstract new(...args: unknown[]) => CCWidgetBase) {
    private _editMode = false;
    private _saving = false;

    // Read dossier from shared lorebridge flag (all 4 section widgets share one data store)
    async getData(): Promise<unknown> {
      const doc = this.document as { getFlag?(scope: string, key: string): unknown };
      return doc.getFlag?.("lorebridge", "npcDossier") ?? {};
    }

    // Write dossier to shared lorebridge flag
    async saveData(data: unknown): Promise<void> {
      const doc = this.document as { setFlag?(scope: string, key: string, val: unknown): Promise<void> };
      await doc.setFlag?.("lorebridge", "npcDossier", data);
    }

    async render(): Promise<string> {
      injectDossierStyles();
      const raw = await this.getData();
      const data = normalizeDossierData(raw);
      const actorName = this._getActorName();

      let contentHtml: string;
      if (this._editMode) {
        switch (section) {
          case "info":     contentHtml = renderInfoEditForm(data); break;
          case "profile":  contentHtml = renderProfileEditForm(data, this.isGM); break;
          case "roleplay": contentHtml = renderRoleplayEditForm(data); break;
          default:         contentHtml = renderKnowledgeEditForm(data);
        }
      } else {
        switch (section) {
          case "info":     contentHtml = renderInfoReadView(data); break;
          case "profile":  contentHtml = await renderProfileReadView(data, this.isGM, actorName); break;
          case "roleplay": contentHtml = renderRoleplayReadView(data, actorName); break;
          default:         contentHtml = renderKnowledgeReadView(data, this.isGM, actorName);
        }
      }

      const editControls = this.isGM
        ? (this._editMode
          ? `<div class="lb-dos-actions">
               <button type="button" class="lb-dos-btn lb-dos-btn--cancel" data-action="cancelEdit">Cancel</button>
               <button type="button" class="lb-dos-btn lb-dos-btn--primary" data-action="saveEdit"${this._saving ? " disabled" : ""}>
                 ${this._saving ? "Saving…" : "Save"}
               </button>
             </div>`
          : `<div class="lb-dos-actions">
               <button type="button" class="lb-dos-btn" data-action="editSection">
                 <i class="fas fa-edit"></i> Edit
               </button>
             </div>`)
        : "";

      return `<div class="lb-dossier">
        <div class="lb-dos-content">${contentHtml}</div>
        ${editControls}
      </div>`;
    }

    async activateListeners(htmlElement: HTMLElement): Promise<void> {
      const proto = Object.getPrototypeOf(Object.getPrototypeOf(this)) as Record<string, unknown>;
      const baseMethod = proto["activateListeners"];
      if (typeof baseMethod === "function") {
        await Promise.resolve((baseMethod as (el: HTMLElement) => void | Promise<void>).call(this, htmlElement));
      }

      htmlElement.querySelector<HTMLButtonElement>('[data-action="editSection"]')?.addEventListener("click", () => {
        if (!this.isGM) return;
        this._editMode = true;
        void this._refreshWidget(htmlElement);
      });

      htmlElement.querySelector<HTMLButtonElement>('[data-action="cancelEdit"]')?.addEventListener("click", () => {
        this._editMode = false;
        void this._refreshWidget(htmlElement);
      });

      htmlElement.querySelector<HTMLButtonElement>('[data-action="saveEdit"]')?.addEventListener("click", async () => {
        if (!this.isGM || this._saving) return;
        this._saving = true;
        try {
          const raw = await this.getData();
          const current = normalizeDossierData(raw);
          const updated = readDossierFromForm(htmlElement, section, current);
          await this.saveData(updated);
          await this._mirrorToActorFlags(updated);
          this._editMode = false;
          const notif = (globalThis as unknown as { ui?: { notifications?: { info(m: string): void } } }).ui;
          notif?.notifications?.info("LoreBridge: NPC Dossier saved.");
        } catch (err) {
          console.error("LoreBridge | NPC Dossier save failed:", err);
          const notif = (globalThis as unknown as { ui?: { notifications?: { warn(m: string): void } } }).ui;
          notif?.notifications?.warn("LoreBridge: NPC Dossier save failed. See console for details.");
        } finally {
          this._saving = false;
          void this._refreshWidget(htmlElement);
        }
      });

      htmlElement.querySelectorAll<HTMLButtonElement>("[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
          const list = btn.dataset["add"] as string;
          const listContainer = htmlElement.querySelector(`[data-list="${list}"]`);
          if (!listContainer) return;
          const newId = uid();
          let rowHtml = "";
          if (list === "relationships") rowHtml = renderRelationshipRow({ id: newId, name: "", description: "" });
          else if (list === "secrets")  rowHtml = renderSecretRow({ id: newId, heading: "", text: "" });
          else if (list === "goals")   rowHtml = renderGoalRow({ id: newId, goal: "", questReference: "" });
          else if (list === "conditionalInfo") rowHtml = renderConditionalRow({ id: newId, trigger: "", response: "", consequence: "", relatedUuid: "", visibility: "normal" });
          else if (list === "qa")      rowHtml = renderQaRow({ id: newId, question: "", answer: "", visibility: "normal", relatedSourceUuid: "" });
          else if (list === "knowledge") rowHtml = renderKnowledgeRow({ id: newId, statement: "", topicOrCategory: "", quality: "knows", sourceUuid: "" });
          if (rowHtml) {
            const div = document.createElement("div");
            div.innerHTML = rowHtml;
            const newRow = div.firstElementChild;
            if (newRow) {
              listContainer.appendChild(newRow);
              this._wireRemoveButtons(listContainer as HTMLElement);
            }
          }
        });
      });

      this._wireRemoveButtons(htmlElement);
    }

    private _getActorName(): string {
      return tryGetLinkedActor(this.document)?.name ?? "";
    }

    private async _mirrorToActorFlags(data: NpcDossierData): Promise<void> {
      try {
        const actor = tryGetLinkedActor(this.document);
        if (actor) await actor.setFlag("lorebridge", "dossierCache", data);
      } catch (err) {
        console.debug("LoreBridge | Could not mirror dossier to actor flags:", err);
      }
    }

    private _wireRemoveButtons(container: HTMLElement): void {
      container.querySelectorAll<HTMLButtonElement>(".lb-dos-remove-row").forEach(btn => {
        const fresh = btn.cloneNode(true) as HTMLButtonElement;
        btn.parentNode?.replaceChild(fresh, btn);
        fresh.addEventListener("click", () => {
          const removeId = fresh.dataset["removeId"];
          const row = container.querySelector(`[data-row-id="${removeId}"]`);
          row?.remove();
        });
      });
    }
  }

  // Give each class a distinct name so CC's widgetType derivation differs per section
  const classNames: Record<DossierSection, string> = {
    info:      "NpcDossierInfoWidget",
    profile:   "NpcDossierProfileWidget",
    roleplay:  "NpcDossierRoleplayWidget",
    knowledge: "NpcDossierKnowledgeWidget",
  };
  Object.defineProperty(DossierSectionWidget, "name", { value: classNames[section] });

  return DossierSectionWidget as unknown as CCWidgetConstructor;
}

// ---------------------------------------------------------------------------
// Widget definitions & auto-add constants
// ---------------------------------------------------------------------------

const LB_WIDGET_DEFS: ReadonlyArray<{ name: string; section: DossierSection; tab: string }> = [
  { name: "LB: NPC Info",        section: "info",      tab: "info" },
  { name: "LB: NPC Profile",     section: "profile",   tab: "custom-info-lb-profile" },
  { name: "LB: NPC Roleplaying", section: "roleplay",  tab: "custom-info-lb-roleplay" },
  { name: "LB: NPC Knowledge",   section: "knowledge", tab: "custom-info-lb-knowledge" },
];

// Custom info tabs injected into each NPC journal's CC sidebar (Profile / Roleplaying / Knowledge)
const LB_CUSTOM_TABS: ReadonlyArray<{ key: string; label: string; icon: string }> = [
  { key: "custom-info-lb-profile",   label: "Profile",     icon: "fas fa-user" },
  { key: "custom-info-lb-roleplay",  label: "Roleplaying", icon: "fas fa-theater-masks" },
  { key: "custom-info-lb-knowledge", label: "Knowledge",   icon: "fas fa-brain" },
];

type CCJournalLike = {
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  flags?: Record<string, Record<string, unknown>>;
};

function isNpcCodexJournal(journal: CCJournalLike): boolean {
  const explicit = String(journal.getFlag("campaign-codex", "type") ?? "").trim();
  if (explicit === "npc") return true;
  return journal.flags?.["core"]?.["sheetClass"] === "campaign-codex.NPCSheet";
}

async function autoAddDossierWidgets(journal: CCJournalLike): Promise<void> {
  if (!isNpcCodexJournal(journal)) return;

  // 1. Merge in Profile / Roleplaying / Knowledge sidebar tabs without duplicating
  const existingTabs = (
    journal.getFlag("campaign-codex", "custom-info-tabs") as
      Array<{ key: string; label: string; icon: string }> | undefined
  ) ?? [];
  const existingTabKeys = new Set(existingTabs.map(t => t.key));
  const tabsToAdd = LB_CUSTOM_TABS.filter(t => !existingTabKeys.has(t.key));
  if (tabsToAdd.length > 0) {
    await journal.setFlag("campaign-codex", "custom-info-tabs", [...existingTabs, ...tabsToAdd]);
  }

  // 2. Merge in sheet-widget entries without duplicating by widgetName
  const existingWidgets = (
    journal.getFlag("campaign-codex", "sheet-widgets") as
      Array<{ widgetName: string; id: string; active: boolean; tab: string }> | undefined
  ) ?? [];
  const existingNames = new Set(existingWidgets.map(w => w.widgetName));
  const widgetsToAdd = LB_WIDGET_DEFS
    .filter(def => !existingNames.has(def.name))
    .map(def => ({ id: uid(), widgetName: def.name, active: true, tab: def.tab }));
  if (widgetsToAdd.length > 0) {
    await journal.setFlag("campaign-codex", "sheet-widgets", [...existingWidgets, ...widgetsToAdd]);
  }
}

// ---------------------------------------------------------------------------
// Render-time tab visibility
// ---------------------------------------------------------------------------

const LB_TAB_KEYS = [
  "custom-info-lb-profile",
  "custom-info-lb-roleplay",
  "custom-info-lb-knowledge",
] as const;

type LbTabKey = (typeof LB_TAB_KEYS)[number];

function getTabShouldHide(key: LbTabKey, isGM: boolean): boolean {
  const settings = getLoreBridgeSettings();
  const visibleKey = key === "custom-info-lb-profile"   ? "npcTabProfileVisible"
                   : key === "custom-info-lb-roleplay"  ? "npcTabRoleplayVisible"
                   : "npcTabKnowledgeVisible" as const;
  const phKey     = key === "custom-info-lb-profile"   ? "npcTabProfilePlayerHidden"
                   : key === "custom-info-lb-roleplay"  ? "npcTabRoleplayPlayerHidden"
                   : "npcTabKnowledgePlayerHidden" as const;
  const visible      = settings[visibleKey] as boolean;
  const playerHidden = settings[phKey]     as boolean;
  return !visible || (playerHidden && !isGM);
}

function applyNpcTabDefaults(frame: HTMLElement): void {
  const isGM = Boolean(
    (game as { user?: { isGM?: boolean } }).user?.isGM,
  );
  for (const key of LB_TAB_KEYS) {
    if (!getTabShouldHide(key, isGM)) continue;
    frame.querySelectorAll<HTMLElement>(`[data-tab="${key}"]`).forEach(el => {
      el.style.display = "none";
    });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCampaignCodexWidget(): void {
  if (!getLoreBridgeSettings().campaignCodexEnabled) {
    console.info("LoreBridge | Campaign Codex NPC Dossier integration disabled in settings.");
    return;
  }
  const cc = game.modules.get("campaign-codex") as CCModuleEntry | undefined;
  if (!cc?.active) {
    console.info("LoreBridge | Campaign Codex not active; NPC Dossier widgets not registered.");
    return;
  }

  const api = cc.api;
  if (!api?.CampaignCodexWidget || !api?.widgetManager?.widgetRegistry) {
    console.warn(
      "LoreBridge | Campaign Codex active but widget API unavailable " +
      "(CampaignCodexWidget or widgetManager.widgetRegistry missing). NPC Dossier widgets not registered."
    );
    return;
  }

  try {
    const Base = api.CampaignCodexWidget;
    const registry = api.widgetManager.widgetRegistry;
    for (const def of LB_WIDGET_DEFS) {
      registry.set(def.name, createSectionWidget(def.section, Base));
    }
    console.info("LoreBridge | NPC Dossier widgets registered with Campaign Codex.");
  } catch (err) {
    console.warn("LoreBridge | Failed to register NPC Dossier widgets:", err);
    return;
  }

  // Auto-add 4 widgets + 3 custom tabs to all existing NPC journals (after CC fully initializes)
  setTimeout(() => {
    const journals = (game.journal as unknown as { contents: CCJournalLike[] }).contents;
    void Promise.all(
      journals.map(j =>
        autoAddDossierWidgets(j).catch((err: unknown) =>
          console.debug("LoreBridge | Auto-add skipped for journal:", err)
        )
      )
    ).then(() => {
      console.info("LoreBridge | NPC Dossier auto-add complete.");
    });
  }, 2000);

  // Auto-add to newly created journals (CC may set type flag synchronously on creation)
  Hooks.on("createJournalEntry", (document: unknown) => {
    setTimeout(
      () => void autoAddDossierWidgets(document as CCJournalLike).catch(() => { /* silent */ }),
      500,
    );
  });

  // Catch journals where CC sets the type flag in a follow-up update after creation
  Hooks.on("updateJournalEntry", (document: unknown, change: unknown) => {
    const changedFlags = (change as Record<string, unknown>)?.["flags"];
    if (!(changedFlags as Record<string, unknown> | undefined)?.["campaign-codex"]) return;
    void autoAddDossierWidgets(document as CCJournalLike).catch(() => { /* silent */ });
  });

  // Apply global NPC tab visibility defaults at render time (ApplicationV2 path).
  // CC's per-sheet "Configure Tabs" overrides take natural precedence because
  // CC controls which tab elements appear in the DOM before this hook fires.
  Hooks.on("renderApplicationV2", (app: unknown) => {
    const appAny = app as { document?: CCJournalLike; element?: HTMLElement };
    const journal = appAny.document;
    const frame   = appAny.element;
    if (!journal || !frame) return;
    if (!isNpcCodexJournal(journal)) return;
    // Defer one tick so CC finishes injecting tab elements after the base render.
    setTimeout(() => applyNpcTabDefaults(frame), 0);
  });

  // Fallback for legacy Application journal sheets (e.g. older CC versions).
  Hooks.on("renderJournalSheet", (...args: unknown[]) => {
    const [app, rawHtml] = args as [{ document?: CCJournalLike }, unknown];
    const journal = app.document;
    if (!journal || !isNpcCodexJournal(journal)) return;
    const frame =
      rawHtml instanceof HTMLElement ? rawHtml
      : (rawHtml as { get?(i: number): HTMLElement } | null)?.get?.(0)
      ?? null;
    if (!frame) return;
    setTimeout(() => applyNpcTabDefaults(frame), 0);
  });
}
