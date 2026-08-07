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
  icon: string;
  fields: FieldMeta[];
};

const SECTION_META: SectionMeta[] = [
  {
    id: "overview",
    label: "Overview",
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
    icon: "fas fa-dice-d20",
    fields: [
      { key: "role", label: "NPC Role" },
      { key: "disposition", label: "Disposition" },
      { key: "currentStatus", label: "Current Status" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Test-safe ApplicationV2 base (mirrors pattern in session-command-center.ts)
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
// Section status helpers
// ---------------------------------------------------------------------------

function sectionHasContent(data: Record<string, string> | undefined): boolean {
  if (!data) return false;
  return Object.values(data).some(v => v && v.trim().length > 0);
}

function sectionStatusIcon(data: Record<string, string> | undefined, fields: FieldMeta[]): string {
  if (!data) return "❌";
  const filled = fields.filter(f => (data[f.key] ?? "").trim().length > 0).length;
  if (filled === 0) return "❌";
  if (filled < fields.length) return "⚠";
  return "✅";
}

// ---------------------------------------------------------------------------
// HTML escape helper
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// NpcWorkspaceApp — ApplicationV2 window
// Use factory pattern to get per-actor window title (same pattern as SharePanel)
// ---------------------------------------------------------------------------

function _buildNpcWorkspaceClass(windowTitle: string) {
  return class extends _AppBase {
    static override DEFAULT_OPTIONS = {
      id: "lorebridge-npc-workspace",
      classes: ["lorebridge-npc-workspace"],
      window: { title: windowTitle, resizable: true },
      position: { width: 760, height: 580 },
    };

    actorId: string = "";
    private _selectedSection: NpcSection = "overview";
    private _editMode = false;
    private _generatingSection: NpcSection | null = null;
    private _generatingFull = false;

    private _getActor(): FoundryActor | undefined {
      return game.actors.get(this.actorId) as FoundryActor | undefined;
    }

    private _getProfile(): NpcProfileSections {
      const actor = this._getActor();
      if (!actor) return {};
      return (actor.getFlag("lorebridge", "npcProfile") as NpcProfileSections | undefined) ?? {};
    }

    private async _persistSection(section: NpcSection, data: Record<string, string>): Promise<void> {
      const actor = this._getActor();
      if (!actor) return;
      const profile = this._getProfile();
      profile[section] = data;
      await actor.setFlag("lorebridge", "npcProfile", profile);
      if (section === "appearance") {
        const overview = profile.overview ?? {};
        const parts = [overview["race"], data["height"], data["build"], data["hair"], data["eyes"], data["clothing"]]
          .filter(Boolean).join(", ");
        if (parts) await actor.setFlag("lorebridge", "portraitDescription", parts);
      }
    }

    override async _renderHTML(_context: Record<string, unknown>, _options: unknown): Promise<HTMLElement> {
      const actor = this._getActor();
      const profile = this._getProfile();
      const section = this._selectedSection;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const sectionData = profile[section] ?? {};

      const isGenerating = this._generatingSection === section || this._generatingFull;
      const hasContent = sectionHasContent(sectionData);
      const isGeneratingAny = this._generatingSection !== null || this._generatingFull;

      const navItems = SECTION_META.map(s => {
        const d = profile[s.id];
        const statusIcon = sectionStatusIcon(d, s.fields);
        const isActive = s.id === section;
        const isGen = this._generatingSection === s.id || this._generatingFull;
        return `
          <li class="lb-ws-nav__item${isActive ? " active" : ""}" data-action="selectSection" data-section="${s.id}" title="${s.label}">
            <span class="lb-ws-nav__status">${isGen ? '<i class="fas fa-spinner fa-spin" style="font-size:0.75em"></i>' : statusIcon}</span>
            <i class="${s.icon}" style="font-size:0.8em;opacity:0.7"></i>
            <span class="lb-ws-nav__label">${s.label}</span>
          </li>`;
      }).join("");

      let sectionContent: string;
      if (isGenerating) {
        sectionContent = `<div class="lb-ws-generating"><i class="fas fa-spinner fa-spin"></i> Generating ${meta.label}…</div>`;
      } else if (this._editMode) {
        const fieldRows = meta.fields.map(f => {
          const val = sectionData[f.key] ?? "";
          return `
            <div class="lb-ws-field lb-ws-field--edit">
              <label class="lb-ws-field__label">${f.label}</label>
              <textarea class="lb-ws-field__textarea" name="${f.key}" rows="2">${escHtml(val)}</textarea>
            </div>`;
        }).join("");
        sectionContent = `
          <form class="lb-ws-edit-form">
            ${fieldRows}
            <div class="lb-ws-edit-actions">
              <button type="button" class="lb-ws-btn lb-ws-btn--primary" data-action="saveSection">
                <i class="fas fa-save"></i> Save
              </button>
              <button type="button" class="lb-ws-btn" data-action="cancelEdit">
                <i class="fas fa-times"></i> Cancel
              </button>
            </div>
          </form>`;
      } else if (!hasContent) {
        sectionContent = `
          <div class="lb-ws-empty">
            <p class="lb-ws-empty__msg">No content yet for <strong>${meta.label}</strong>.</p>
            <button type="button" class="lb-ws-btn lb-ws-btn--primary" data-action="generateSection" data-section="${section}" ${isGeneratingAny ? "disabled" : ""}>
              <i class="fas fa-magic"></i> Generate ${meta.label}
            </button>
          </div>`;
      } else {
        const fieldRows = meta.fields.map(f => {
          const val = sectionData[f.key] ?? "";
          if (!val) return "";
          return `
            <div class="lb-ws-field">
              <span class="lb-ws-field__label">${f.label}</span>
              <span class="lb-ws-field__value">${escHtml(val)}</span>
            </div>`;
        }).join("");
        sectionContent = `<div class="lb-ws-fields">${fieldRows || "<p style='color:var(--color-text-light-tertiary)'>No fields filled.</p>"}</div>`;
      }

      const sectionActionBar = (!isGenerating && !this._editMode) ? `
        <div class="lb-ws-section-actions">
          ${hasContent
            ? `<button type="button" class="lb-ws-btn" data-action="regenerateSection" data-section="${section}" ${isGeneratingAny ? "disabled" : ""}>
                 <i class="fas fa-sync-alt"></i> Regenerate
               </button>
               <button type="button" class="lb-ws-btn" data-action="editSection">
                 <i class="fas fa-edit"></i> Edit
               </button>
               <button type="button" class="lb-ws-btn" data-action="copySection">
                 <i class="fas fa-copy"></i> Copy
               </button>`
            : ""
          }
        </div>` : "";

      const actorPortrait = actor?.img
        ? `<img class="lb-ws-portrait" src="${actor.img}" alt="${escHtml(actor.name ?? "")}">`
        : "";

      const container = document.createElement("div");
      container.innerHTML = `
        <style>
          .lorebridge-npc-workspace .window-content {
            display:flex; flex-direction:column; overflow:hidden; padding:0; height:100%;
          }
          .lb-ws { display:flex; flex-direction:row; flex:1; min-height:0; overflow:hidden; }
          .lb-ws-sidebar {
            width:180px; min-width:130px; flex-shrink:0; display:flex; flex-direction:column;
            border-right:1px solid var(--color-border-dark,#ccc);
            background:var(--color-bg-option,#f0ebe0); overflow:hidden;
          }
          .lb-ws-portrait { width:100%; max-height:110px; object-fit:cover; display:block; }
          .lb-ws-full-gen {
            display:block; width:calc(100% - 12px); margin:6px; padding:4px 6px;
            background:var(--color-bg-btn,#4e7ac7); color:#fff; border:none; border-radius:3px;
            cursor:pointer; font-size:0.78em; text-align:center;
          }
          .lb-ws-full-gen:disabled { opacity:0.5; cursor:not-allowed; }
          .lb-ws-nav { list-style:none; margin:0; padding:0; flex:1; overflow-y:auto; }
          .lb-ws-nav__item {
            display:flex; align-items:center; gap:5px; padding:6px 8px;
            cursor:pointer; font-size:0.82em;
            border-bottom:1px solid var(--color-border-light,#ddd);
          }
          .lb-ws-nav__item:hover { background:var(--color-bg-hover,#e0dac8); }
          .lb-ws-nav__item.active { background:var(--color-bg-secondary,#d8d0c0); font-weight:bold; }
          .lb-ws-nav__status { width:18px; flex-shrink:0; text-align:center; font-size:0.75em; }
          .lb-ws-nav__label { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
          .lb-ws-content { flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; }
          .lb-ws-section-header {
            display:flex; align-items:center; justify-content:space-between;
            padding:6px 10px; border-bottom:1px solid var(--color-border-dark,#ccc);
            flex-shrink:0; background:var(--color-bg-secondary,#f5f0e8);
          }
          .lb-ws-section-header h3 { margin:0; font-size:0.9em; }
          .lb-ws-section-actions { display:flex; gap:4px; }
          .lb-ws-body { flex:1; min-height:0; overflow-y:auto; padding:10px 12px; }
          .lb-ws-fields { display:flex; flex-direction:column; gap:4px; }
          .lb-ws-field {
            display:grid; grid-template-columns:140px 1fr; gap:6px; align-items:start;
            padding:4px 0; border-bottom:1px solid var(--color-border-light,#eee);
          }
          .lb-ws-field--edit { display:flex; flex-direction:column; gap:2px; margin-bottom:4px; }
          .lb-ws-field__label { font-size:0.78em; color:var(--color-text-light-tertiary,#888); font-weight:bold; padding-top:2px; }
          .lb-ws-field__value { font-size:0.86em; line-height:1.4; }
          .lb-ws-field__textarea { width:100%; box-sizing:border-box; font-size:0.85em; resize:vertical; min-height:40px; }
          .lb-ws-edit-actions { display:flex; gap:6px; margin-top:8px; }
          .lb-ws-empty {
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            height:100%; gap:10px; text-align:center; padding:20px;
          }
          .lb-ws-empty__msg { color:var(--color-text-light-tertiary,#888); font-size:0.9em; margin:0; }
          .lb-ws-generating {
            display:flex; align-items:center; justify-content:center; gap:8px;
            height:100%; font-size:0.9em; color:var(--color-text-light-tertiary,#888);
          }
          .lb-ws-btn {
            padding:3px 8px; border:1px solid var(--color-border-dark,#aaa); border-radius:3px;
            background:var(--color-bg-btn,#fff); cursor:pointer; font-size:0.8em; white-space:nowrap;
          }
          .lb-ws-btn:hover:not(:disabled) { background:var(--color-bg-hover,#e8e3d8); }
          .lb-ws-btn:disabled { opacity:0.5; cursor:not-allowed; }
          .lb-ws-btn--primary {
            background:var(--color-bg-btn-primary,#4e7ac7); color:#fff;
            border-color:var(--color-bg-btn-primary,#3a5e9e);
          }
          .lb-ws-btn--primary:hover:not(:disabled) { background:#3a5e9e; }
          .lb-ws-edit-form { display:flex; flex-direction:column; }
        </style>
        <div class="lb-ws">
          <aside class="lb-ws-sidebar">
            ${actorPortrait}
            <button type="button" class="lb-ws-full-gen" data-action="generateFull" ${isGeneratingAny ? "disabled" : ""}>
              <i class="fas fa-magic"></i> Generate Full Profile
            </button>
            <ul class="lb-ws-nav">${navItems}</ul>
          </aside>
          <div class="lb-ws-content">
            <div class="lb-ws-section-header">
              <h3><i class="${meta.icon}"></i> ${meta.label}</h3>
              ${sectionActionBar}
            </div>
            <div class="lb-ws-body">
              ${sectionContent}
            </div>
          </div>
        </div>`;
      return container;
    }

    override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
      content.replaceChildren(...Array.from(result.childNodes));
    }

    override _onClickAction(event: PointerEvent, target: HTMLElement): void | Promise<void> {
      const action = target.dataset["action"];

      if (action === "selectSection") {
        const section = target.dataset["section"] as NpcSection | undefined;
        if (section && section !== this._selectedSection) {
          this._selectedSection = section;
          this._editMode = false;
          void this.render({ force: true });
        }
        return;
      }

      if (action === "generateSection" || action === "regenerateSection") {
        const section = (target.dataset["section"] ?? this._selectedSection) as NpcSection;
        void this._generateSection(section);
        return;
      }

      if (action === "generateFull") {
        void this._generateFull();
        return;
      }

      if (action === "editSection") {
        this._editMode = true;
        void this.render({ force: true });
        return;
      }

      if (action === "saveSection") {
        void this._doSaveEdit();
        return;
      }

      if (action === "cancelEdit") {
        this._editMode = false;
        void this.render({ force: true });
        return;
      }

      if (action === "copySection") {
        void this._copySection();
        return;
      }
    }

    private async _generateSection(section: NpcSection): Promise<void> {
      const actor = this._getActor();
      if (!actor) return;

      this._generatingSection = section;
      this._editMode = false;
      await this.render({ force: true });

      const profile = this._getProfile();
      const biography = (() => {
        const raw = (actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
        return raw.replace(/<[^>]+>/g, "").slice(0, 1000);
      })();

      try {
        const result = await postBackend<{ section: NpcSection; data: NpcProfileSections; provider: string }>(
          "v1/generate/npc-profile-section",
          {
            section,
            actorName: actor.name ?? "",
            actorBiography: biography,
            existingProfile: profile as Record<string, unknown>,
            tone: "neutral",
            worldName: game.world?.title ?? "",
          },
        );

        const sectionData = result.data[section] ?? {};
        await this._persistSection(section, sectionData as Record<string, string>);

        const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
        const summary = Object.entries(sectionData as Record<string, string>)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");

        void addHistoryEntry({
          type: "npc-profile",
          label: `NPC Profile — ${actor.name ?? ""} / ${meta.label}`,
          prompt: `Section: ${section}`,
          content: summary,
        });

        const metaLabel = SECTION_META.find(s => s.id === section)?.label ?? section;
        ui.notifications.info(`LoreBridge: ${metaLabel} generated for ${actor.name ?? "NPC"}.`);
      } catch (err) {
        ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Section generation failed."}`);
      } finally {
        this._generatingSection = null;
        await this.render({ force: true });
      }
    }

    private async _generateFull(): Promise<void> {
      const actor = this._getActor();
      if (!actor) return;

      this._generatingFull = true;
      this._editMode = false;
      await this.render({ force: true });

      const biography = (() => {
        const raw = (actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
        return raw.replace(/<[^>]+>/g, "").slice(0, 1000);
      })();

      let errorCount = 0;
      for (const meta of SECTION_META) {
        const profile = this._getProfile();
        try {
          const result = await postBackend<{ section: NpcSection; data: NpcProfileSections; provider: string }>(
            "v1/generate/npc-profile-section",
            {
              section: meta.id,
              actorName: actor.name ?? "",
              actorBiography: biography,
              existingProfile: profile as Record<string, unknown>,
              tone: "neutral",
              worldName: game.world?.title ?? "",
            },
          );
          const sectionData = result.data[meta.id] ?? {};
          await this._persistSection(meta.id, sectionData as Record<string, string>);
        } catch {
          errorCount++;
        }
      }

      this._generatingFull = false;

      if (errorCount > 0) {
        ui.notifications.warn(`LoreBridge: Full profile generated with ${errorCount} section error(s).`);
      } else {
        ui.notifications.info(`LoreBridge: Full NPC profile generated for ${actor.name ?? "NPC"}.`);
      }

      void addHistoryEntry({
        type: "npc-profile",
        label: `NPC Full Profile — ${actor.name ?? ""}`,
        prompt: "Full profile generation",
        content: JSON.stringify(this._getProfile(), null, 2),
      });

      await this.render({ force: true });
    }

    private async _doSaveEdit(): Promise<void> {
      const form = this.element?.querySelector(".lb-ws-edit-form");
      if (!form) return;

      const meta = SECTION_META.find(s => s.id === this._selectedSection) ?? SECTION_META[0]!;
      const data: Record<string, string> = {};
      for (const field of meta.fields) {
        const textarea = form.querySelector<HTMLTextAreaElement>(`textarea[name="${field.key}"]`);
        data[field.key] = textarea?.value.trim() ?? "";
      }

      await this._persistSection(this._selectedSection, data);
      this._editMode = false;
      await this.render({ force: true });
      ui.notifications.info(`LoreBridge: ${meta.label} saved.`);
    }

    private async _copySection(): Promise<void> {
      const profile = this._getProfile();
      const meta = SECTION_META.find(s => s.id === this._selectedSection) ?? SECTION_META[0]!;
      const sectionData = (profile[this._selectedSection] ?? {}) as Record<string, string>;
      const text = meta.fields
        .filter(f => sectionData[f.key])
        .map(f => `${f.label}: ${sectionData[f.key]}`)
        .join("\n");
      if (!text) return;
      await navigator.clipboard.writeText(text);
      ui.notifications.info(`LoreBridge: ${meta.label} copied to clipboard.`);
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _workspaceInstance: InstanceType<ReturnType<typeof _buildNpcWorkspaceClass>> | undefined;

export function openNpcWorkspace(actorId: string): void {
  const actor = game.actors.get(actorId) as FoundryActor | undefined;
  const windowTitle = actor ? `NPC Workspace — ${actor.name}` : "LoreBridge — NPC Workspace";

  if (_workspaceInstance?.rendered && _workspaceInstance.actorId === actorId) {
    _workspaceInstance.bringToFront();
    return;
  }

  if (_workspaceInstance?.rendered) {
    void _workspaceInstance.close({ force: true });
  }

  const WorkspaceClass = _buildNpcWorkspaceClass(windowTitle);
  const instance = new WorkspaceClass();
  instance.actorId = actorId;
  _workspaceInstance = instance;
  void instance.render({ force: true });
}
