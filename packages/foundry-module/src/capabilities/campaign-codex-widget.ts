/**
 * Campaign Codex NPC Dossier widget.
 *
 * Registers a structured NPC dossier widget with Campaign Codex when that
 * module is active and exposes a compatible widget API. LoreBridge continues
 * to work normally when Campaign Codex is absent or disabled.
 *
 * Data ownership:
 * - Campaign Codex stores the dossier via its own widget storage.
 * - A normalised copy is mirrored to actor.flags["lorebridge"]["dossierCache"]
 *   so that the NPC workspace and roleplay features can prefer dossier data
 *   over the legacy LoreBridge NPC Profile without coupling to Campaign Codex
 *   internals.
 *
 * Widget registration happens in Hooks.once("ready") to ensure Campaign Codex
 * has fully initialised its API before LoreBridge accesses it.
 */

import type {
  NpcDossierData,
  NpcDossierGoal,
  NpcDossierConditional,
  NpcDossierQa,
  NpcDossierKnowledge,
} from "@lorebridge/shared";

export type { NpcDossierData };

// ---------------------------------------------------------------------------
// Campaign Codex API types (minimal surface used by LoreBridge)
// ---------------------------------------------------------------------------

type CCWidgetConstructor = new (
  widgetId: string,
  initialData: unknown,
  document: unknown,
) => CCWidgetBase;

interface CCWidgetBase {
  readonly isGM: boolean;
  readonly widgetId: string;
  getData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
  renderWidget(): void;
  render(): Promise<string>;
  activateListeners(htmlElement: HTMLElement): Promise<void> | void;
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
// Dossier types re-exported so callers can type-check cache reads
// ---------------------------------------------------------------------------

// (imported above from backend)

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
      sourceBook: "",
      sourcePage: "",
      mapReference: "",
      statBlockReference: "",
      statBlockAlterations: "",
    },
    identity: {
      sexOrGender: "",
      race: "",
      age: "",
      alignment: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      occupationOrClass: "",
      distinguishingFeatures: "",
    },
    overview: {
      bullets: [],
      familyNotes: "",
      friends: "",
      otherAcquaintances: "",
      relationshipNotes: "",
      secretsNarrative: "",
    },
    roleplay: {
      firstImpression: "",
      personalityAndDemeanor: "",
      voiceOrSpeech: "",
      conversationalApproach: "",
      runningTheNpc: "",
      goals: [],
    },
    conditionalInfo: [],
    qa: [],
    knowledge: [],
  };
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

// ---------------------------------------------------------------------------
// Context extraction — used by npc-workspace and npc-mention
// ---------------------------------------------------------------------------

/** Read the dossier cache mirrored from the CC widget for a given actor. */
export function getActorDossierCache(actor: FoundryActor): NpcDossierData | null {
  const raw = actor.getFlag("lorebridge", "dossierCache") as unknown;
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as Record<string, unknown>)["schemaVersion"] !== 1
  ) {
    return null;
  }
  return raw as NpcDossierData;
}

/**
 * Serialize dossier data to a short text summary for AI context.
 * Excludes secrets narrative for non-GM use.
 */
export function getDossierSummaryText(dossier: NpcDossierData, isGM = true): string {
  const parts: string[] = [];

  const ref = dossier.reference;
  if (ref.nicknames.trim()) parts.push(`Nicknames: ${ref.nicknames.trim()}`);
  if (ref.sourceBook.trim()) {
    const page = ref.sourcePage.trim() ? ` p.${ref.sourcePage.trim()}` : "";
    parts.push(`Source: ${ref.sourceBook.trim()}${page}`);
  }
  if (ref.statBlockReference.trim()) parts.push(`Stat Block: ${ref.statBlockReference.trim()}`);

  const id = dossier.identity;
  if (id.sexOrGender.trim()) parts.push(`Gender: ${id.sexOrGender.trim()}`);
  if (id.race.trim()) parts.push(`Race: ${id.race.trim()}`);
  if (id.age.trim()) parts.push(`Age: ${id.age.trim()}`);
  if (id.alignment.trim()) parts.push(`Alignment: ${id.alignment.trim()}`);
  if (id.occupationOrClass.trim()) parts.push(`Occupation: ${id.occupationOrClass.trim()}`);
  if (id.distinguishingFeatures.trim()) parts.push(`Appearance: ${id.distinguishingFeatures.trim()}`);

  const bullets = dossier.overview.bullets.filter(b => b.trim()).slice(0, 6);
  if (bullets.length) parts.push(...bullets.map(b => `- ${b.trim()}`));

  if (dossier.overview.familyNotes.trim()) parts.push(`Family: ${dossier.overview.familyNotes.trim()}`);

  if (isGM && dossier.overview.secretsNarrative.trim()) {
    const stripped = stripHtml(stripSecretBlocks(dossier.overview.secretsNarrative));
    if (stripped) parts.push(`[GM] Secrets: ${stripped}`);
  }

  const rp = dossier.roleplay;
  if (rp.personalityAndDemeanor.trim()) parts.push(`Personality: ${rp.personalityAndDemeanor.trim()}`);
  if (rp.voiceOrSpeech.trim()) parts.push(`Voice: ${rp.voiceOrSpeech.trim()}`);
  if (rp.conversationalApproach.trim()) parts.push(`Conversational Approach: ${rp.conversationalApproach.trim()}`);
  if (rp.runningTheNpc.trim()) parts.push(`Running this NPC: ${rp.runningTheNpc.trim()}`);

  const goals = rp.goals.filter(g => g.goal.trim()).slice(0, 3);
  if (goals.length) parts.push(`Goals: ${goals.map(g => g.goal.trim()).join("; ")}`);

  const normalQa = dossier.qa
    .filter(q => (isGM || q.visibility !== "secret") && q.question.trim() && q.answer.trim())
    .slice(0, 5);
  if (normalQa.length) {
    for (const q of normalQa) {
      parts.push(`Q: ${q.question.trim()} → ${q.answer.trim()}`);
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Try to find the actor linked to a Campaign Codex document
// ---------------------------------------------------------------------------

function tryGetLinkedActor(doc: unknown): FoundryActor | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;

  // Pattern 1: system.actorId (Campaign Codex v6+ style)
  const sysId = (d["system"] as Record<string, unknown> | undefined)?.["actorId"];
  if (typeof sysId === "string") {
    const a = (game.actors as { get(id: string): FoundryActor | undefined }).get(sysId);
    if (a) return a;
  }

  // Pattern 2: flags["campaign-codex"].actorId
  const flagId = (
    (d["flags"] as Record<string, Record<string, unknown>> | undefined)?.["campaign-codex"]
  )?.["actorId"];
  if (typeof flagId === "string") {
    const a = (game.actors as { get(id: string): FoundryActor | undefined }).get(flagId);
    if (a) return a;
  }

  // Pattern 3: linked actor document
  const linked = (d["linked"] as { id?: string } | undefined);
  if (linked?.id) {
    const a = (game.actors as { get(id: string): FoundryActor | undefined }).get(linked.id);
    if (a) return a;
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

type DossierSection = "reference" | "overview" | "roleplay" | "knowledge";

function renderFactRow(label: string, value: string): string {
  if (!value.trim()) return "";
  return `<div class="lb-dos-fact">
    <div class="lb-dos-fact-label">${escHtml(label)}</div>
    <div class="lb-dos-fact-value">${escHtml(value)}</div>
  </div>`;
}

function renderSectionHeader(title: string): string {
  return `<div class="lb-dos-section-title">${escHtml(title)}</div>`;
}

// Reference tab — read view
function renderReferenceReadView(data: NpcDossierData): string {
  const ref = data.reference;
  const id = data.identity;
  const refFacts = [
    renderFactRow("Nicknames", ref.nicknames),
    renderFactRow("Source Book", ref.sourceBook),
    renderFactRow("Page", ref.sourcePage),
    renderFactRow("Map Reference", ref.mapReference),
    renderFactRow("Stat Block", ref.statBlockReference),
    renderFactRow("Alterations", ref.statBlockAlterations),
  ].filter(Boolean).join("");
  const idFacts = [
    renderFactRow("Gender", id.sexOrGender),
    renderFactRow("Race", id.race),
    renderFactRow("Age", id.age),
    renderFactRow("Alignment", id.alignment),
    renderFactRow("Height", id.height),
    renderFactRow("Weight", id.weight),
    renderFactRow("Eyes", id.eyes),
    renderFactRow("Hair", id.hair),
    renderFactRow("Occupation / Class", id.occupationOrClass),
    renderFactRow("Distinguishing Features", id.distinguishingFeatures),
  ].filter(Boolean).join("");
  return `
    ${refFacts || idFacts ? "" : '<p class="lb-dos-empty">No reference data yet.</p>'}
    ${refFacts ? `${renderSectionHeader("Reference")}
    <div class="lb-dos-grid">${refFacts}</div>` : ""}
    ${idFacts ? `${renderSectionHeader("Identity & Appearance")}
    <div class="lb-dos-grid">${idFacts}</div>` : ""}
  `;
}

// Reference tab — edit view
function renderReferenceEditForm(data: NpcDossierData): string {
  const ref = data.reference;
  const id = data.identity;
  return `<div class="lb-dos-edit-form">
    ${renderSectionHeader("Reference")}
    ${renderTextField("nicknames", "Nicknames", ref.nicknames)}
    <div class="lb-dos-grid-2">
      ${renderTextField("sourceBook", "Source Book", ref.sourceBook)}
      ${renderTextField("sourcePage", "Page", ref.sourcePage)}
    </div>
    ${renderTextField("mapReference", "Map Reference", ref.mapReference)}
    ${renderTextField("statBlockReference", "Stat Block Reference", ref.statBlockReference)}
    ${renderTextField("statBlockAlterations", "Stat Block Alterations", ref.statBlockAlterations)}
    ${renderSectionHeader("Identity & Appearance")}
    <p class="lb-dos-field-hint">Gender and alignment are synced from the linked Actor when present. Values here are dossier-owned.</p>
    <div class="lb-dos-grid-2">
      ${renderTextField("sexOrGender", "Gender", id.sexOrGender)}
      ${renderTextField("race", "Race", id.race)}
      ${renderTextField("age", "Age", id.age)}
      ${renderTextField("alignment", "Alignment", id.alignment)}
      ${renderTextField("height", "Height", id.height)}
      ${renderTextField("weight", "Weight / Build", id.weight)}
      ${renderTextField("eyes", "Eyes", id.eyes)}
      ${renderTextField("hair", "Hair", id.hair)}
    </div>
    ${renderTextField("occupationOrClass", "Occupation / Class", id.occupationOrClass)}
    ${renderTextArea("distinguishingFeatures", "Distinguishing Features", id.distinguishingFeatures, 2)}
  </div>`;
}

// Overview tab — read view (async for TextEditor secrets enrichment)
async function renderOverviewReadView(data: NpcDossierData, isGM: boolean): Promise<string> {
  const ov = data.overview;
  const bullets = ov.bullets.filter(b => b.trim());
  const bulletsHtml = bullets.length
    ? `<ul class="lb-dos-bullets">${bullets.map(b => `<li>${escHtml(b)}</li>`).join("")}</ul>`
    : "";
  const facts = [
    renderFactRow("Family", ov.familyNotes),
    renderFactRow("Friends", ov.friends),
    renderFactRow("Other Acquaintances", ov.otherAcquaintances),
    renderFactRow("Relationship Notes", ov.relationshipNotes),
  ].filter(Boolean).join("");

  let secretsHtml = "";
  if (isGM && ov.secretsNarrative.trim()) {
    const enriched = await enrichText(ov.secretsNarrative, true);
    secretsHtml = `<div class="lb-dos-secrets">
      <div class="lb-dos-fact-label" style="margin-bottom:0.25rem;">GM Only — Secrets &amp; Hidden Information</div>
      ${enriched}
    </div>`;
  }

  const isEmpty = !bulletsHtml && !facts && !secretsHtml;
  return `
    ${isEmpty ? '<p class="lb-dos-empty">No overview data yet.</p>' : ""}
    ${bulletsHtml ? `${renderSectionHeader("Overview")}\n${bulletsHtml}` : ""}
    ${facts ? `${renderSectionHeader("Background & Relationships")}\n<div class="lb-dos-grid">${facts}</div>` : ""}
    ${secretsHtml}
  `;
}

// Overview tab — edit view
function renderOverviewEditForm(data: NpcDossierData): string {
  const ov = data.overview;
  const bulletsText = ov.bullets.filter(b => b.trim()).join("\n");
  return `<div class="lb-dos-edit-form">
    ${renderSectionHeader("Overview Bullets")}
    <p class="lb-dos-field-hint">One bullet per line.</p>
    ${renderTextArea("bullets", "Overview Bullets", bulletsText, 4)}
    ${renderSectionHeader("Background & Relationships")}
    ${renderTextArea("familyNotes", "Family Notes", ov.familyNotes, 2)}
    ${renderTextArea("friends", "Friends", ov.friends, 2)}
    ${renderTextArea("otherAcquaintances", "Other Acquaintances", ov.otherAcquaintances, 2)}
    ${renderTextArea("relationshipNotes", "Relationship Notes", ov.relationshipNotes, 2)}
    ${renderSectionHeader("GM Only — Secrets & Hidden Information")}
    <p class="lb-dos-field-hint">Wrap GM-only content in Foundry secret blocks:
      <code>&lt;section class="secret"&gt;…&lt;/section&gt;</code>.
      This content is excluded from player-safe context and AI responses.</p>
    ${renderTextArea("secretsNarrative", "Secrets Narrative (GM Only)", ov.secretsNarrative, 4)}
  </div>`;
}

// Roleplay tab — read view
function renderRoleplayReadView(data: NpcDossierData): string {
  const rp = data.roleplay;
  const facts = [
    renderFactRow("First Impression", rp.firstImpression),
    renderFactRow("Personality & Demeanor", rp.personalityAndDemeanor),
    renderFactRow("Voice / Speech", rp.voiceOrSpeech),
    renderFactRow("Conversational Approach", rp.conversationalApproach),
    renderFactRow("Running This NPC", rp.runningTheNpc),
  ].filter(Boolean).join("");
  const goals = rp.goals.filter(g => g.goal.trim());
  const goalsHtml = goals.length ? `
    ${renderSectionHeader("Current Goals")}
    <ul class="lb-dos-bullets">
      ${goals.map(g =>
        `<li>${escHtml(g.goal)}${g.questReference.trim() ? ` <span class="lb-dos-tag">Quest: ${escHtml(g.questReference)}</span>` : ""}</li>`
      ).join("")}
    </ul>` : "";
  const isEmpty = !facts && !goalsHtml;
  return `
    ${isEmpty ? '<p class="lb-dos-empty">No roleplay data yet.</p>' : ""}
    ${facts ? `${renderSectionHeader("Guidance")}\n<div class="lb-dos-grid">${facts}</div>` : ""}
    ${goalsHtml}
  `;
}

// Roleplay tab — edit view
function renderRoleplayEditForm(data: NpcDossierData): string {
  const rp = data.roleplay;
  return `<div class="lb-dos-edit-form">
    ${renderSectionHeader("Guidance")}
    ${renderTextArea("firstImpression", "First Impression", rp.firstImpression, 2)}
    ${renderTextArea("personalityAndDemeanor", "Personality & Demeanor", rp.personalityAndDemeanor, 2)}
    ${renderTextField("voiceOrSpeech", "Voice / Speech Guidance", rp.voiceOrSpeech)}
    ${renderTextArea("conversationalApproach", "Conversational Approach", rp.conversationalApproach, 2)}
    ${renderTextArea("runningTheNpc", "Running This NPC", rp.runningTheNpc, 2)}
    ${renderSectionHeader("Current Goals")}
    <div class="lb-dos-repeatable" data-list="goals">
      ${rp.goals.map(g => renderGoalEditRow(g)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="goals">
      <i class="fas fa-plus"></i> Add Goal
    </button>
  </div>`;
}

function renderGoalEditRow(g: NpcDossierGoal): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(g.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="goal" placeholder="Goal description" value="${escHtml(g.goal)}">
      <input type="text" class="lb-dos-field-input" data-field="questReference" placeholder="Quest reference (optional)" value="${escHtml(g.questReference)}">
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(g.id)}" title="Remove"><i class="fas fa-times"></i></button>
  </div>`;
}

// Knowledge tab — read view
function renderKnowledgeReadView(data: NpcDossierData, isGM: boolean): string {
  const visibleCond = data.conditionalInfo.filter(c => isGM || c.visibility !== "secret");
  const visibleQa = data.qa.filter(q => isGM || q.visibility !== "secret");
  const condHtml = visibleCond.length
    ? visibleCond.map(c => `<div class="lb-dos-card">
        <div class="lb-dos-card-label">Trigger</div>
        <div class="lb-dos-card-value">${escHtml(c.trigger)}</div>
        <div class="lb-dos-card-label" style="margin-top:0.25rem">Response</div>
        <div class="lb-dos-card-value">${escHtml(c.response)}</div>
        ${c.consequence.trim() ? `<div class="lb-dos-card-label" style="margin-top:0.25rem">Consequence</div>
        <div class="lb-dos-card-value">${escHtml(c.consequence)}</div>` : ""}
        ${c.visibility === "secret" ? '<span class="lb-dos-tag lb-dos-tag--gm">GM</span>' : ""}
      </div>`).join("")
    : "";
  const qaHtml = visibleQa.length
    ? visibleQa.map(q => `<div class="lb-dos-card">
        <div class="lb-dos-card-label">Q</div>
        <div class="lb-dos-card-value">${escHtml(q.question)}</div>
        <div class="lb-dos-card-label" style="margin-top:0.25rem">A</div>
        <div class="lb-dos-card-value">${escHtml(q.answer)}</div>
        ${q.visibility === "secret" ? '<span class="lb-dos-tag lb-dos-tag--gm">GM</span>' : ""}
      </div>`).join("")
    : "";
  const knowHtml = data.knowledge.filter(k => k.statement.trim())
    .map(k => `<div class="lb-dos-card">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.15rem">
        <span class="lb-dos-tag lb-dos-tag--quality-${escHtml(k.quality)}">${escHtml(k.quality)}</span>
        ${k.topicOrCategory.trim() ? `<span class="lb-dos-fact-label">${escHtml(k.topicOrCategory)}</span>` : ""}
      </div>
      <div class="lb-dos-card-value">${escHtml(k.statement)}</div>
    </div>`).join("");

  const isEmpty = !condHtml && !qaHtml && !knowHtml;
  return `
    ${isEmpty ? '<p class="lb-dos-empty">No knowledge data yet.</p>' : ""}
    ${condHtml ? `${renderSectionHeader("Conditional Information")}\n${condHtml}` : ""}
    ${qaHtml ? `${renderSectionHeader("Questions & Answers")}\n${qaHtml}` : ""}
    ${knowHtml ? `${renderSectionHeader("General Knowledge")}\n${knowHtml}` : ""}
  `;
}

// Knowledge tab — edit view
function renderKnowledgeEditForm(data: NpcDossierData): string {
  const visOptions = ["normal", "conditional", "secret"]
    .map(v => `<option value="${v}">{v}</option>`)
    .join("");
  const qOptions = ["knows", "believes", "rumor", "mistaken"]
    .map(v => `<option value="${v}">${v}</option>`)
    .join("");
  return `<div class="lb-dos-edit-form">
    ${renderSectionHeader("Conditional Information")}
    <div class="lb-dos-repeatable" data-list="conditionalInfo">
      ${data.conditionalInfo.map(c => renderConditionalEditRow(c)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="conditionalInfo">
      <i class="fas fa-plus"></i> Add Conditional
    </button>
    ${renderSectionHeader("Questions & Answers")}
    <div class="lb-dos-repeatable" data-list="qa">
      ${data.qa.map(q => renderQaEditRow(q)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="qa">
      <i class="fas fa-plus"></i> Add Q&amp;A
    </button>
    ${renderSectionHeader("General Knowledge")}
    <div class="lb-dos-repeatable" data-list="knowledge">
      ${data.knowledge.map(k => renderKnowledgeEditRow(k)).join("")}
    </div>
    <button type="button" class="lb-dos-add-row" data-add="knowledge">
      <i class="fas fa-plus"></i> Add Knowledge
    </button>
    ${visOptions} ${qOptions}
  </div>`;
}

function renderConditionalEditRow(c: NpcDossierConditional): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(c.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="trigger" placeholder="Trigger condition" value="${escHtml(c.trigger)}">
      <input type="text" class="lb-dos-field-input" data-field="response" placeholder="Response" value="${escHtml(c.response)}">
      <input type="text" class="lb-dos-field-input" data-field="consequence" placeholder="Consequence (optional)" value="${escHtml(c.consequence)}">
      <select class="lb-dos-field-input" data-field="visibility">
        ${(["normal", "conditional", "secret"] as const).map(v =>
          `<option value="${v}"${c.visibility === v ? " selected" : ""}>${v}</option>`
        ).join("")}
      </select>
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(c.id)}" title="Remove"><i class="fas fa-times"></i></button>
  </div>`;
}

function renderQaEditRow(q: NpcDossierQa): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(q.id)}">
    <div class="lb-dos-repeat-fields">
      <input type="text" class="lb-dos-field-input" data-field="question" placeholder="Question" value="${escHtml(q.question)}">
      <textarea class="lb-dos-field-textarea" data-field="answer" rows="2" placeholder="Answer">${escHtml(q.answer)}</textarea>
      <select class="lb-dos-field-input" data-field="visibility">
        ${(["normal", "conditional", "secret"] as const).map(v =>
          `<option value="${v}"${q.visibility === v ? " selected" : ""}>${v}</option>`
        ).join("")}
      </select>
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(q.id)}" title="Remove"><i class="fas fa-times"></i></button>
  </div>`;
}

function renderKnowledgeEditRow(k: NpcDossierKnowledge): string {
  return `<div class="lb-dos-repeatable-row" data-row-id="${escHtml(k.id)}">
    <div class="lb-dos-repeat-fields">
      <textarea class="lb-dos-field-textarea" data-field="statement" rows="2" placeholder="Knowledge statement">${escHtml(k.statement)}</textarea>
      <input type="text" class="lb-dos-field-input" data-field="topicOrCategory" placeholder="Topic / Category" value="${escHtml(k.topicOrCategory)}">
      <select class="lb-dos-field-input" data-field="quality">
        ${(["knows", "believes", "rumor", "mistaken"] as const).map(v =>
          `<option value="${v}"${k.quality === v ? " selected" : ""}>${v}</option>`
        ).join("")}
      </select>
    </div>
    <button type="button" class="lb-dos-remove-row" data-remove-id="${escHtml(k.id)}" title="Remove"><i class="fas fa-times"></i></button>
  </div>`;
}

function renderTextField(name: string, label: string, value: string): string {
  return `<div class="lb-dos-field-group">
    <label class="lb-dos-field-label" for="lb-dos-${escHtml(name)}">${escHtml(label)}</label>
    <input type="text" id="lb-dos-${escHtml(name)}" class="lb-dos-field-input" name="${escHtml(name)}" value="${escHtml(value)}">
  </div>`;
}

function renderTextArea(name: string, label: string, value: string, rows = 3): string {
  return `<div class="lb-dos-field-group">
    <label class="lb-dos-field-label" for="lb-dos-${escHtml(name)}">${escHtml(label)}</label>
    <textarea id="lb-dos-${escHtml(name)}" class="lb-dos-field-textarea" name="${escHtml(name)}" rows="${rows}">${escHtml(value)}</textarea>
  </div>`;
}

// TextEditor enrichment (GM sees secrets, non-GM does not)
async function enrichText(html: string, isGM: boolean): Promise<string> {
  try {
    const TE = (globalThis as unknown as { TextEditor?: { enrichHTML(c: string, o?: Record<string, unknown>): Promise<string> } }).TextEditor;
    if (TE?.enrichHTML) {
      return await TE.enrichHTML(html, { secrets: isGM, async: true });
    }
  } catch { /* Foundry not available (e.g., tests) */ }
  // Fallback: strip secret blocks for non-GM, return raw for GM
  return isGM ? html : stripSecretBlocks(html);
}

// ---------------------------------------------------------------------------
// Read form data from edit elements
// ---------------------------------------------------------------------------

function readTextField(container: Element, name: string): string {
  return (container.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "").trim();
}

function readTextArea(container: Element, name: string): string {
  return (container.querySelector<HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? "").trim();
}

function readRepeatableList<T>(container: Element, listName: string, readRow: (row: Element) => T | null): T[] {
  const items: T[] = [];
  container.querySelectorAll(`[data-list="${listName}"] [data-row-id]`).forEach(row => {
    const item = readRow(row);
    if (item) items.push(item);
  });
  return items;
}

function readGoalRow(row: Element): NpcDossierGoal | null {
  const id = row.getAttribute("data-row-id") ?? uid();
  const goal = (row.querySelector<HTMLInputElement>('[data-field="goal"]')?.value ?? "").trim();
  const questReference = (row.querySelector<HTMLInputElement>('[data-field="questReference"]')?.value ?? "").trim();
  if (!goal) return null;
  return { id, goal, questReference };
}

function readConditionalRow(row: Element): NpcDossierConditional | null {
  const id = row.getAttribute("data-row-id") ?? uid();
  const trigger = (row.querySelector<HTMLInputElement>('[data-field="trigger"]')?.value ?? "").trim();
  const response = (row.querySelector<HTMLInputElement>('[data-field="response"]')?.value ?? "").trim();
  const consequence = (row.querySelector<HTMLInputElement>('[data-field="consequence"]')?.value ?? "").trim();
  const visibility = (row.querySelector<HTMLSelectElement>('[data-field="visibility"]')?.value ?? "normal") as NpcDossierConditional["visibility"];
  if (!trigger && !response) return null;
  return { id, trigger, response, consequence, relatedUuid: "", visibility };
}

function readQaRow(row: Element): NpcDossierQa | null {
  const id = row.getAttribute("data-row-id") ?? uid();
  const question = (row.querySelector<HTMLInputElement>('[data-field="question"]')?.value ?? "").trim();
  const answer = (row.querySelector<HTMLTextAreaElement>('[data-field="answer"]')?.value ?? "").trim();
  const visibility = (row.querySelector<HTMLSelectElement>('[data-field="visibility"]')?.value ?? "normal") as NpcDossierQa["visibility"];
  if (!question && !answer) return null;
  return { id, question, answer, visibility, relatedSourceUuid: "" };
}

function readKnowledgeRow(row: Element): NpcDossierKnowledge | null {
  const id = row.getAttribute("data-row-id") ?? uid();
  const statement = (row.querySelector<HTMLTextAreaElement>('[data-field="statement"]')?.value ?? "").trim();
  const topicOrCategory = (row.querySelector<HTMLInputElement>('[data-field="topicOrCategory"]')?.value ?? "").trim();
  const quality = (row.querySelector<HTMLSelectElement>('[data-field="quality"]')?.value ?? "knows") as NpcDossierKnowledge["quality"];
  if (!statement) return null;
  return { id, statement, topicOrCategory, quality, sourceUuid: "" };
}

// ---------------------------------------------------------------------------
// Read full dossier data from an edit form element
// ---------------------------------------------------------------------------

function readDossierFromForm(container: Element, section: DossierSection, current: NpcDossierData): NpcDossierData {
  const updated = JSON.parse(JSON.stringify(current)) as NpcDossierData;

  if (section === "reference") {
    updated.reference = {
      nicknames: readTextField(container, "nicknames"),
      sourceBook: readTextField(container, "sourceBook"),
      sourcePage: readTextField(container, "sourcePage"),
      mapReference: readTextField(container, "mapReference"),
      statBlockReference: readTextField(container, "statBlockReference"),
      statBlockAlterations: readTextField(container, "statBlockAlterations"),
    };
    updated.identity = {
      sexOrGender: readTextField(container, "sexOrGender"),
      race: readTextField(container, "race"),
      age: readTextField(container, "age"),
      alignment: readTextField(container, "alignment"),
      height: readTextField(container, "height"),
      weight: readTextField(container, "weight"),
      eyes: readTextField(container, "eyes"),
      hair: readTextField(container, "hair"),
      occupationOrClass: readTextField(container, "occupationOrClass"),
      distinguishingFeatures: readTextArea(container, "distinguishingFeatures"),
    };
  } else if (section === "overview") {
    const bulletsRaw = readTextArea(container, "bullets");
    const bullets = bulletsRaw.split("\n").map(b => b.trim()).filter(Boolean);
    updated.overview = {
      bullets,
      familyNotes: readTextArea(container, "familyNotes"),
      friends: readTextArea(container, "friends"),
      otherAcquaintances: readTextArea(container, "otherAcquaintances"),
      relationshipNotes: readTextArea(container, "relationshipNotes"),
      secretsNarrative: readTextArea(container, "secretsNarrative"),
    };
  } else if (section === "roleplay") {
    updated.roleplay = {
      firstImpression: readTextArea(container, "firstImpression"),
      personalityAndDemeanor: readTextArea(container, "personalityAndDemeanor"),
      voiceOrSpeech: readTextField(container, "voiceOrSpeech"),
      conversationalApproach: readTextArea(container, "conversationalApproach"),
      runningTheNpc: readTextArea(container, "runningTheNpc"),
      goals: readRepeatableList(container, "goals", readGoalRow),
    };
  } else if (section === "knowledge") {
    updated.conditionalInfo = readRepeatableList(container, "conditionalInfo", readConditionalRow);
    updated.qa = readRepeatableList(container, "qa", readQaRow);
    updated.knowledge = readRepeatableList(container, "knowledge", readKnowledgeRow);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Widget class factory
// ---------------------------------------------------------------------------

export function createNpcDossierWidget(CampaignCodexWidget: CCWidgetConstructor): CCWidgetConstructor {
  class NpcDossierWidget extends (CampaignCodexWidget as abstract new(...args: unknown[]) => CCWidgetBase) {
    private _editMode = false;
    private _activeSection: DossierSection = "reference";
    private _saving = false;

    async render(): Promise<string> {
      const raw = await this.getData();
      const data = (
        raw && typeof raw === "object" && (raw as Record<string, unknown>)["schemaVersion"] === 1
          ? raw
          : makeDefaultDossierData()
      ) as NpcDossierData;

      const tabs: { id: DossierSection; label: string }[] = [
        { id: "reference", label: "Reference" },
        { id: "overview", label: "Overview" },
        { id: "roleplay", label: "Roleplay" },
        { id: "knowledge", label: "Knowledge" },
      ];

      const tabsHtml = tabs.map(t =>
        `<button type="button" class="lb-dos-tab${this._activeSection === t.id ? " active" : ""}" data-section="${t.id}">${escHtml(t.label)}</button>`
      ).join("");

      let contentHtml: string;
      if (this._editMode) {
        if (this._activeSection === "reference") contentHtml = renderReferenceEditForm(data);
        else if (this._activeSection === "overview") contentHtml = renderOverviewEditForm(data);
        else if (this._activeSection === "roleplay") contentHtml = renderRoleplayEditForm(data);
        else contentHtml = renderKnowledgeEditForm(data);
      } else {
        if (this._activeSection === "reference") contentHtml = renderReferenceReadView(data);
        else if (this._activeSection === "overview") contentHtml = await renderOverviewReadView(data, this.isGM);
        else if (this._activeSection === "roleplay") contentHtml = renderRoleplayReadView(data);
        else contentHtml = renderKnowledgeReadView(data, this.isGM);
      }

      const editControls = this.isGM
        ? (this._editMode
          ? `<div class="lb-dos-actions">
              <button type="button" class="lb-dos-btn lb-dos-btn--cancel" data-action="cancelEdit">Cancel</button>
              <button type="button" class="lb-dos-btn lb-dos-btn--primary" data-action="saveEdit" ${this._saving ? "disabled" : ""}>
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
        <nav class="lb-dos-nav">${tabsHtml}</nav>
        <div class="lb-dos-content">
          ${contentHtml}
        </div>
        ${editControls}
      </div>`;
    }

    async activateListeners(htmlElement: HTMLElement): Promise<void> {
      // Call base class implementation via prototype to avoid TypeScript "always true" warning
      const proto = Object.getPrototypeOf(Object.getPrototypeOf(this)) as Record<string, unknown>;
      const baseMethod = proto["activateListeners"];
      if (typeof baseMethod === "function") {
        await Promise.resolve((baseMethod as (el: HTMLElement) => void | Promise<void>).call(this, htmlElement));
      }

      // Tab navigation
      htmlElement.querySelectorAll<HTMLButtonElement>(".lb-dos-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          this._activeSection = btn.dataset["section"] as DossierSection;
          this._editMode = false;
          this.renderWidget();
        });
      });

      // Edit button
      htmlElement.querySelector<HTMLButtonElement>('[data-action="editSection"]')?.addEventListener("click", () => {
        if (!this.isGM) return;
        this._editMode = true;
        this.renderWidget();
      });

      // Cancel edit
      htmlElement.querySelector<HTMLButtonElement>('[data-action="cancelEdit"]')?.addEventListener("click", () => {
        this._editMode = false;
        this.renderWidget();
      });

      // Save edit
      htmlElement.querySelector<HTMLButtonElement>('[data-action="saveEdit"]')?.addEventListener("click", async () => {
        if (!this.isGM || this._saving) return;
        this._saving = true;
        try {
          const raw = await this.getData();
          const current = (
            raw && typeof raw === "object" && (raw as Record<string, unknown>)["schemaVersion"] === 1
              ? raw
              : makeDefaultDossierData()
          ) as NpcDossierData;
          const updated = readDossierFromForm(htmlElement, this._activeSection, current);
          await this.saveData(updated);
          await this._mirrorToActorFlags(updated);
          this._editMode = false;
          const n = (globalThis as unknown as { ui?: { notifications?: { info(m: string): void } } }).ui;
          n?.notifications?.info("LoreBridge: NPC Dossier saved.");
        } catch (err) {
          console.error("LoreBridge | NPC Dossier save failed:", err);
          const n = (globalThis as unknown as { ui?: { notifications?: { warn(m: string): void } } }).ui;
          n?.notifications?.warn("LoreBridge: NPC Dossier save failed. See console for details.");
        } finally {
          this._saving = false;
          this.renderWidget();
        }
      });

      // Add repeatable row buttons
      htmlElement.querySelectorAll<HTMLButtonElement>("[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
          const list = btn.dataset["add"] as string;
          const container = htmlElement.querySelector(`[data-list="${list}"]`);
          if (!container) return;
          const newId = uid();
          let rowHtml = "";
          if (list === "goals") rowHtml = renderGoalEditRow({ id: newId, goal: "", questReference: "" });
          else if (list === "conditionalInfo") rowHtml = renderConditionalEditRow({ id: newId, trigger: "", response: "", consequence: "", relatedUuid: "", visibility: "normal" });
          else if (list === "qa") rowHtml = renderQaEditRow({ id: newId, question: "", answer: "", visibility: "normal", relatedSourceUuid: "" });
          else if (list === "knowledge") rowHtml = renderKnowledgeEditRow({ id: newId, statement: "", topicOrCategory: "", quality: "knows", sourceUuid: "" });
          if (rowHtml) {
            const div = document.createElement("div");
            div.innerHTML = rowHtml;
            const newRow = div.firstElementChild;
            if (newRow) {
              container.appendChild(newRow);
              this._wireRemoveButtons(container as HTMLElement);
            }
          }
        });
      });

      this._wireRemoveButtons(htmlElement);
    }

    private _wireRemoveButtons(container: HTMLElement): void {
      container.querySelectorAll<HTMLButtonElement>(".lb-dos-remove-row").forEach(btn => {
        // Avoid double-binding by cloning
        const fresh = btn.cloneNode(true) as HTMLButtonElement;
        btn.parentNode?.replaceChild(fresh, btn);
        fresh.addEventListener("click", () => {
          const removeId = fresh.dataset["removeId"];
          const row = container.querySelector(`[data-row-id="${removeId}"]`);
          row?.remove();
        });
      });
    }

    private async _mirrorToActorFlags(data: NpcDossierData): Promise<void> {
      try {
        const actor = tryGetLinkedActor((this as unknown as { document: unknown }).document);
        if (actor) {
          await actor.setFlag("lorebridge", "dossierCache", data);
        }
      } catch (err) {
        // Non-fatal: mirror is best-effort; CC storage is authoritative
        console.debug("LoreBridge | Could not mirror dossier to actor flags:", err);
      }
    }
  }

  return NpcDossierWidget as unknown as CCWidgetConstructor;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCampaignCodexWidget(): void {
  const cc = game.modules.get("campaign-codex") as CCModuleEntry | undefined;
  if (!cc?.active) {
    console.debug("LoreBridge | Campaign Codex is not active; NPC Dossier widget not registered.");
    return;
  }

  const api = cc.api;
  if (!api?.CampaignCodexWidget || !api?.widgetManager?.widgetRegistry) {
    console.warn(
      "LoreBridge | Campaign Codex is active but does not expose the widget API " +
      "(CampaignCodexWidget or widgetManager.widgetRegistry missing). NPC Dossier widget not registered."
    );
    return;
  }

  try {
    const DossierWidget = createNpcDossierWidget(api.CampaignCodexWidget);
    api.widgetManager.widgetRegistry.set("LoreBridge NPC Dossier", DossierWidget);
    console.info("LoreBridge | NPC Dossier widget registered with Campaign Codex.");
  } catch (err) {
    console.warn("LoreBridge | Failed to register NPC Dossier widget with Campaign Codex:", err);
  }
}
