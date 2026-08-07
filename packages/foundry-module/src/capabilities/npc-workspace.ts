import { getLoreBridgeSettings } from "../settings.js";
import { addHistoryEntry } from "../generation-history.js";

// ---------------------------------------------------------------------------
// Types — mirror the backend NpcProfileSections model
// ---------------------------------------------------------------------------

type NpcSection =
  | "overview"
  | "appearance"
  | "personalityAndMotivation"
  | "relationships"
  | "secretsAndStory"
  | "history"
  | "gameplay";

type NpcProfileSections = {
  overview?: Record<string, string>;
  appearance?: Record<string, string>;
  personalityAndMotivation?: Record<string, string>;
  relationships?: Record<string, string>;
  secretsAndStory?: Record<string, string>;
  history?: Record<string, string>;
  gameplay?: Record<string, string>;
};

type FieldMeta = { key: string; label: string };

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
      { key: "gender", label: "Gender" },
      { key: "faith", label: "Faith" },
      { key: "socialClass", label: "Social Class" },
      { key: "reputation", label: "Reputation" },
      { key: "residence", label: "Residence" },
      { key: "languages", label: "Languages" },
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
// Shared profile I/O via actor flags
// ---------------------------------------------------------------------------

function getProfile(actor: FoundryActor): NpcProfileSections {
  return (actor.getFlag("lorebridge", "npcProfile") as NpcProfileSections | undefined) ?? {};
}

async function persistSection(actor: FoundryActor, section: NpcSection, data: Record<string, string>): Promise<void> {
  const profile = getProfile(actor);
  profile[section] = data;
  await actor.setFlag("lorebridge", "npcProfile", profile);
  if (section === "appearance") {
    const overview = (profile.overview ?? {}) as Record<string, string>;
    const parts = [overview["race"], data["height"], data["build"], data["hair"], data["eyes"], data["clothing"]]
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
const PANEL_STYLES = `
<style id="lb-npc-profile-styles">
  /* Base: dark-friendly defaults. Foundry's own CSS vars override these when defined. */
  #lb-npc-profile-panel {
    border-top: 2px solid var(--color-border-dark, #555);
    margin-top: 8px;
    font-size: 0.82em;
    color: var(--color-text-primary, inherit);
  }
  .lb-panel__header {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; cursor: pointer;
    background: var(--color-bg-secondary, #2a2a2a);
    user-select: none;
  }
  .lb-panel__header:hover { background: var(--color-bg-option, #333); }
  .lb-panel__title { flex: 1; font-weight: bold; font-size: 0.9em; }
  .lb-panel__toggle { font-size: 0.75em; opacity: 0.6; }
  .lb-panel__gen-all {
    padding: 2px 8px; border: 1px solid #3a5e9e;
    border-radius: 3px; background: #4e7ac7;
    color: #fff; cursor: pointer; font-size: 0.78em; white-space: nowrap;
  }
  .lb-panel__gen-all:hover:not(:disabled) { background: #3a5e9e; }
  .lb-panel__gen-all:disabled { opacity: 0.5; cursor: not-allowed; }
  .lb-panel__body { padding: 4px 0; }
  .lb-panel__body.hidden { display: none; }

  .lb-sec {
    border-bottom: 1px solid var(--color-border-dark, #444);
  }
  .lb-sec__header {
    display: flex; align-items: center; gap: 5px;
    padding: 4px 8px; cursor: pointer;
    background: var(--color-bg-option, #252525);
  }
  .lb-sec__header:hover { background: var(--color-bg-secondary, #303030); }
  .lb-sec__status { width: 16px; text-align: center; flex-shrink: 0; }
  .lb-sec__icon { opacity: 0.6; flex-shrink: 0; }
  .lb-sec__name { flex: 1; font-weight: bold; }
  .lb-sec__actions { display: flex; gap: 3px; }
  .lb-sec__btn {
    padding: 1px 6px; border: 1px solid var(--color-border-dark, #555);
    border-radius: 3px; background: var(--color-bg-secondary, #2a2a2a);
    color: var(--color-text-primary, inherit);
    cursor: pointer; font-size: 0.76em; white-space: nowrap;
  }
  .lb-sec__btn:hover:not(:disabled) { background: var(--color-bg-option, #333); }
  .lb-sec__btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .lb-sec__btn--primary { background: #4e7ac7; color: #fff; border-color: #3a5e9e; }
  .lb-sec__btn--primary:hover:not(:disabled) { background: #3a5e9e; }
  .lb-sec__content { padding: 4px 8px 6px; display: none; }
  .lb-sec__content.open { display: block; }
  .lb-sec__empty { color: var(--color-text-light-tertiary, #888); font-style: italic; padding: 2px 0; }
  .lb-sec__fields { display: grid; grid-template-columns: 130px 1fr; gap: 2px 8px; }
  .lb-sec__label { color: var(--color-text-light-tertiary, #999); font-size: 0.9em; }
  .lb-sec__value { font-size: 0.9em; line-height: 1.4; }
  .lb-sec__edit-form { display: flex; flex-direction: column; gap: 3px; }
  .lb-sec__field-row { display: flex; flex-direction: column; gap: 1px; }
  .lb-sec__field-label { font-size: 0.8em; color: var(--color-text-light-tertiary, #999); }
  .lb-sec__textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 36px; font-size: 0.85em; }
  .lb-sec__edit-actions { display: flex; gap: 4px; margin-top: 4px; }
  .lb-sec__spinner { display: inline-block; animation: lb-spin 1s linear infinite; }
  @keyframes lb-spin { to { transform: rotate(360deg); } }

  /* Light mode overrides — when Foundry is set to Light or when system is light */
  @media (prefers-color-scheme: light) {
    .lb-panel__header { background: var(--color-bg-secondary, #e8e3d8); }
    .lb-panel__header:hover { background: var(--color-bg-option, #ddd8c8); }
    .lb-sec { border-bottom-color: var(--color-border-light, #ccc); }
    .lb-sec__header { background: var(--color-bg-option, #f0ebe0); }
    .lb-sec__header:hover { background: var(--color-bg-secondary, #e8e3d8); }
    .lb-sec__btn { background: var(--color-bg-secondary, #f0ebe0); border-color: var(--color-border-dark, #aaa); }
    .lb-sec__btn:hover:not(:disabled) { background: var(--color-bg-option, #e0dac8); }
  }
  /* Foundry "Light" theme class (set on <html> or <body> by Foundry's color scheme setting) */
  :root[data-color-scheme="light"] .lb-panel__header,
  body.light-theme .lb-panel__header {
    background: var(--color-bg-secondary, #e8e3d8);
  }
  :root[data-color-scheme="light"] .lb-sec__header,
  body.light-theme .lb-sec__header {
    background: var(--color-bg-option, #f0ebe0);
  }
  :root[data-color-scheme="light"] .lb-sec__btn,
  body.light-theme .lb-sec__btn {
    background: var(--color-bg-secondary, #f0ebe0);
    border-color: var(--color-border-dark, #aaa);
  }
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
       </button>`;

  let contentHtml: string;
  if (!hasData) {
    contentHtml = `<p class="lb-sec__empty">Not yet generated. Click Generate to create this section.</p>`;
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
  return `
    ${PANEL_STYLES}
    <div id="${PANEL_ID}" data-lb-actor="${actor.id}">
      <div class="lb-panel__header" data-lb-action="toggle-panel">
        <span>🤖</span>
        <span class="lb-panel__title">LoreBridge NPC Profile</span>
        <button class="lb-panel__gen-all" data-lb-action="gen-all" title="Generate all sections">
          <i class="fas fa-magic"></i> Generate Full Profile
        </button>
        <span class="lb-panel__toggle">${collapsed ? "▶" : "▼"}</span>
      </div>
      <div class="lb-panel__body${collapsed ? " hidden" : ""}">
        ${sectionsHtml}
      </div>
    </div>`;
}

function findInsertTarget(frame: HTMLElement): HTMLElement | null {
  // Try dnd5e Biography tab first, then fall back to window-content
  const candidates = [
    '[data-tab="biography"]',
    '.tab.biography',
    '.biography-content',
    '.biography',
    '.tab-content[data-tab="biography"]',
    '.window-content',
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

  // Restore open sections
  const newPanel = frame.querySelector(`#${PANEL_ID}`);
  if (newPanel && openSections.size > 0) {
    openSections.forEach(section => {
      const contentEl = newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      contentEl?.classList.add("open");
    });
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

    if (action === "gen-all") {
      e.stopPropagation();
      void (async () => {
        const genAllBtn = panel.querySelector<HTMLButtonElement>(".lb-panel__gen-all");
        if (genAllBtn) genAllBtn.disabled = true;
        let errCount = 0;
        for (const meta of SECTION_META) {
          setGeneratingState(panel, meta.id, true);
          try {
            await generateSection(actor, meta.id);
            refreshPanel(frame, actor);
          } catch {
            errCount++;
          }
        }
        if (errCount > 0) {
          ui.notifications.warn(`LoreBridge: Full profile generated with ${errCount} error(s).`);
        } else {
          ui.notifications.info(`LoreBridge: Full NPC profile generated for ${actor.name ?? "NPC"}.`);
        }
        void addHistoryEntry({
          type: "npc-profile",
          label: `NPC Full Profile — ${actor.name ?? ""}`,
          prompt: "Full profile generation",
          content: JSON.stringify(getProfile(actor), null, 2),
        });
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
      const fieldRows = meta.fields.map(f => `
        <div class="lb-sec__field-row">
          <label class="lb-sec__field-label">${f.label}</label>
          <textarea class="lb-sec__textarea" name="${f.key}" rows="2">${escHtml(sectionData[f.key] ?? "")}</textarea>
        </div>`).join("");

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
      return;
    }

    if (action === "save-section" && section) {
      e.stopPropagation();
      const content = panel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      if (!content) return;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const data: Record<string, string> = {};
      for (const f of meta.fields) {
        const ta = content.querySelector<HTMLTextAreaElement>(`textarea[name="${f.key}"]`);
        data[f.key] = ta?.value.trim() ?? "";
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
          return `
            <div class="lb-ws-field--edit">
              <label class="lb-ws-field__label">${f.label}</label>
              <textarea class="lb-ws-field__textarea" name="${f.key}" rows="2">${escHtml(val)}</textarea>
            </div>`;
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
          .lb-ws-full-gen {
            display:block; width:calc(100% - 10px); margin:5px; padding:4px;
            background:#4e7ac7; color:#fff; border:none; border-radius:3px;
            cursor:pointer; font-size:0.76em; text-align:center;
          }
          .lb-ws-full-gen:disabled { opacity:0.5; cursor:not-allowed; }
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
      if (action === "generateFull") { void this._doGenerateFull(actor); return; }
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

    private async _doGenerateFull(actor: FoundryActor): Promise<void> {
      this._generatingFull = true;
      this._editMode = false;
      await this.render({ force: true });
      let errCount = 0;
      for (const meta of SECTION_META) {
        try { await generateSection(actor, meta.id); } catch { errCount++; }
      }
      this._generatingFull = false;
      if (errCount > 0) ui.notifications.warn(`LoreBridge: Full profile with ${errCount} error(s).`);
      else ui.notifications.info(`LoreBridge: Full NPC profile generated.`);
      void addHistoryEntry({ type: "npc-profile", label: `NPC Full Profile — ${actor.name ?? ""}`, prompt: "Full profile generation", content: JSON.stringify(getProfile(actor), null, 2) });
      await this.render({ force: true });
    }

    private async _doSaveEdit(actor: FoundryActor): Promise<void> {
      const form = this.element?.querySelector(".lb-ws-edit-form");
      if (!form) return;
      const meta = SECTION_META.find(s => s.id === this._selectedSection) ?? SECTION_META[0]!;
      const data: Record<string, string> = {};
      for (const f of meta.fields) {
        const ta = form.querySelector<HTMLTextAreaElement>(`textarea[name="${f.key}"]`);
        data[f.key] = ta?.value.trim() ?? "";
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
