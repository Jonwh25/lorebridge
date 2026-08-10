import {
  getContextProfiles,
  saveContextProfiles,
  getActiveProfileId,
  setActiveProfileId,
  makeProfile,
  getProfileFilter,
  hasStaleFolderRefs,
  type ContextProfile,
  type ContextProfileDocType,
  type ContextProfileVisibility,
} from "./capabilities/context-profile.js";
import { gatherDocuments } from "./capabilities/consistency-audit.js";

type AnyRecord = Record<string, unknown>;
type AppV2Instance = { render(options?: AnyRecord): Promise<unknown>; readonly element: HTMLElement };
type AppV2Static = { new (options?: AnyRecord): AppV2Instance; DEFAULT_OPTIONS: AnyRecord; PARTS?: AnyRecord };

const foundryApi = (
  globalThis as unknown as { foundry?: { applications?: { api?: AnyRecord } } }
).foundry?.applications?.api as
  | {
      ApplicationV2?: AppV2Static;
      HandlebarsApplicationMixin?: (base: AppV2Static) => AppV2Static;
      DialogV2?: {
        new (opts: AnyRecord): AppV2Instance;
        prompt<T>(opts: AnyRecord): Promise<T | null>;
        confirm(opts: AnyRecord): Promise<boolean>;
      };
    }
  | undefined;

const TestSafeBase: AppV2Static = class implements AppV2Instance {
  static DEFAULT_OPTIONS: AnyRecord = {};
  static PARTS: AnyRecord = {};
  readonly element: HTMLElement = document.createElement("div");
  async render(_options?: AnyRecord): Promise<unknown> { return undefined; }
};

const ApplicationV2 = foundryApi?.ApplicationV2 ?? TestSafeBase;
const AppBase: AppV2Static = foundryApi?.HandlebarsApplicationMixin
  ? foundryApi.HandlebarsApplicationMixin(ApplicationV2)
  : ApplicationV2;

// ---------------------------------------------------------------------------
// Dialog helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildFolderColumnsHtml(profile: ContextProfile | null): string {
  const checkedIds = new Set(profile?.allowedFolderIds ?? []);
  const relevantTypes: Record<string, string> = { JournalEntry: "Journals", Actor: "Actors", Scene: "Scenes" };
  const grouped: Record<string, Array<{ id: string; name: string }>> = {};
  const allFolders = (game as unknown as { folders?: Iterable<{ id: string; name: string; type: string }> }).folders;
  if (!allFolders) return `<p style="font-size:11px;color:#888;margin:0">No folders found.</p>`;
  for (const folder of allFolders) {
    if (!(folder.type in relevantTypes)) continue;
    if (!grouped[folder.type]) grouped[folder.type] = [];
    grouped[folder.type]!.push({ id: folder.id, name: folder.name });
  }
  const typeKeys = Object.keys(grouped);
  if (typeKeys.length === 0) return `<p style="font-size:11px;color:#888;margin:0">No folders found.</p>`;
  let html = `<div style="display:flex;gap:8px">`;
  for (const type of typeKeys) {
    const folders = grouped[type]!;
    const label = escapeHtml(relevantTypes[type] ?? type);
    html += `<div class="lb-folder-group" data-group-type="${escapeHtml(type)}" style="flex:1;min-width:0">
      <label style="display:flex;align-items:center;gap:5px;font-weight:bold;font-size:12px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid #ccc;cursor:pointer">
        <input type="checkbox" class="lb-folder-all" data-group="${escapeHtml(type)}"> ${label}
      </label>
      <div style="max-height:300px;overflow-y:auto">`;
    for (const f of folders) {
      const checked = checkedIds.has(f.id) ? " checked" : "";
      html += `<label style="display:flex;align-items:center;gap:5px;padding:2px 0;font-size:12px;cursor:pointer">
        <input type="checkbox" data-folder-id="${escapeHtml(f.id)}" data-folder-group="${escapeHtml(type)}"${checked}> ${escapeHtml(f.name)}
      </label>`;
    }
    html += `</div></div>`;
  }
  html += `</div>`;
  return html;
}

function buildFormHtml(profile: ContextProfile | null): string {
  const name = profile ? escapeHtml(profile.name) : "";
  const maxDocs = profile ? profile.maxDocs : 50;
  const types = profile ? profile.allowedDocTypes : (["journal", "actor", "scene"] as ContextProfileDocType[]);
  const vis = profile ? profile.visibilityMode : "all";
  const includeActiveScene = profile?.includeActiveScene ?? false;
  const excludedCompendiums = escapeHtml((profile?.excludedCompendiums ?? []).join(", "));
  const fs = "border:1px solid #ccc;border-radius:4px;padding:8px;margin:0";
  return `
    <div style="margin-bottom:10px">
      <label style="display:block;font-size:12px;font-weight:bold;margin-bottom:3px">Profile Name</label>
      <input type="text" name="name" value="${name}" placeholder="e.g. Player Session" autofocus style="width:100%;box-sizing:border-box">
    </div>
    <div style="display:flex;gap:10px;align-items:flex-start">
      <div style="flex:0 0 140px">
        <fieldset style="${fs}">
          <legend>Document Types</legend>
          <label style="display:block;font-size:13px;margin-bottom:4px"><input type="checkbox" name="journals" ${types.includes("journal") ? "checked" : ""}> Journals</label>
          <label style="display:block;font-size:13px;margin-bottom:4px"><input type="checkbox" name="actors" ${types.includes("actor") ? "checked" : ""}> Actors</label>
          <label style="display:block;font-size:13px;margin-bottom:4px"><input type="checkbox" name="scenes" ${types.includes("scene") ? "checked" : ""}> Scenes</label>
          <hr style="border:none;border-top:1px solid #ccc;margin:6px 0">
          <label style="display:block;font-size:11px"><input type="checkbox" name="includeActiveScene" ${includeActiveScene ? "checked" : ""}> Always include active scene</label>
        </fieldset>
      </div>
      <div style="flex:1;min-width:0">
        <fieldset style="${fs}">
          <legend>Folder Restrictions <span style="color:#888;font-size:10px">(unchecked = any)</span></legend>
          ${buildFolderColumnsHtml(profile)}
        </fieldset>
      </div>
      <div style="flex:0 0 165px">
        <fieldset style="${fs}">
          <legend>Filters</legend>
          <label style="display:block;font-size:12px;margin-bottom:2px">Visibility</label>
          <select name="visibilityMode" style="width:100%;margin-bottom:8px;font-size:12px">
            <option value="all" ${vis === "all" ? "selected" : ""}>All documents</option>
            <option value="player-safe" ${vis === "player-safe" ? "selected" : ""}>Player-visible only</option>
            <option value="gm-only" ${vis === "gm-only" ? "selected" : ""}>GM-only</option>
          </select>
          <label style="display:block;font-size:12px;margin-bottom:2px">Max Docs <span style="color:#888;font-size:10px">(10–200)</span></label>
          <input type="number" name="maxDocs" value="${maxDocs}" min="10" max="200" step="10" style="width:100%;margin-bottom:8px;font-size:12px;box-sizing:border-box">
          <label style="display:block;font-size:12px;margin-bottom:2px">Excluded Compendiums</label>
          <input type="text" name="excludedCompendiums" value="${excludedCompendiums}" placeholder="world.secret, dnd5e.monsters" style="width:100%;font-size:11px;box-sizing:border-box">
        </fieldset>
      </div>
    </div>`;
}

function readProfileFromDialog(button: HTMLButtonElement, existingId?: string): ContextProfile | null {
  const form = button.form;
  if (!form) return null;
  const name = (form.querySelector<HTMLInputElement>('input[name="name"]')?.value ?? "").trim();
  if (!name) {
    ui.notifications?.warn("LoreBridge: Profile name is required.");
    return null;
  }
  const allowedDocTypes: ContextProfileDocType[] = [];
  if (form.querySelector<HTMLInputElement>('input[name="journals"]')?.checked) allowedDocTypes.push("journal");
  if (form.querySelector<HTMLInputElement>('input[name="actors"]')?.checked) allowedDocTypes.push("actor");
  if (form.querySelector<HTMLInputElement>('input[name="scenes"]')?.checked) allowedDocTypes.push("scene");
  if (allowedDocTypes.length === 0) {
    ui.notifications?.warn("LoreBridge: At least one document type must be selected.");
    return null;
  }
  const vis = (form.querySelector<HTMLSelectElement>('select[name="visibilityMode"]')?.value ?? "all") as ContextProfileVisibility;
  const maxDocs = Math.min(200, Math.max(10, parseInt(form.querySelector<HTMLInputElement>('input[name="maxDocs"]')?.value ?? "50", 10) || 50));
  const includeActiveScene = form.querySelector<HTMLInputElement>('input[name="includeActiveScene"]')?.checked ?? false;
  const excludedRaw = (form.querySelector<HTMLInputElement>('input[name="excludedCompendiums"]')?.value ?? "").trim();
  const excludedCompendiums = excludedRaw ? excludedRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const allowedFolderIds: string[] = [];
  form.querySelectorAll<HTMLInputElement>("input[data-folder-id]").forEach((cb) => {
    if (cb.checked) {
      const fid = cb.dataset["folderId"];
      if (fid) allowedFolderIds.push(fid);
    }
  });
  return makeProfile(name, allowedDocTypes, vis, maxDocs, existingId, includeActiveScene, excludedCompendiums, allowedFolderIds);
}

function openProfileDialog(
  profile: ContextProfile | null,
  onSave: (result: ContextProfile) => Promise<void>,
): void {
  const DialogV2 = foundryApi?.DialogV2;
  if (!DialogV2) return;
  const title = profile ? `Edit Profile: ${profile.name}` : "New Context Profile";
  const dialog = new DialogV2({
    window: { title, resizable: true },
    position: { width: 900, height: 520 },
    content: buildFormHtml(profile),
    buttons: [
      {
        action: "save",
        label: profile ? "Save" : "Create",
        default: true,
        callback: (_event: Event, button: HTMLElement) => {
          const result = readProfileFromDialog(button as HTMLButtonElement, profile?.id);
          if (result) void onSave(result);
        },
      },
      { action: "cancel", label: "Cancel" },
    ],
  } as AnyRecord);
  void dialog.render({ force: true } as AnyRecord).then(() => {
    const el = dialog.element;
    el.querySelectorAll<HTMLInputElement>(".lb-folder-all").forEach((allCb) => {
      const group = allCb.dataset["group"] ?? "";
      const getGroupCbs = () => Array.from(el.querySelectorAll<HTMLInputElement>(`input[data-folder-group="${group}"]`));
      const syncAllState = () => {
        const cbs = getGroupCbs();
        const n = cbs.filter((c) => c.checked).length;
        allCb.indeterminate = n > 0 && n < cbs.length;
        allCb.checked = n === cbs.length;
      };
      syncAllState();
      allCb.addEventListener("click", () => {
        const shouldCheck = !getGroupCbs().every((c) => c.checked);
        getGroupCbs().forEach((c) => { c.checked = shouldCheck; });
        allCb.indeterminate = false;
        allCb.checked = shouldCheck;
      });
      getGroupCbs().forEach((cb) => { cb.addEventListener("change", syncAllState); });
    });
  });
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export class LoreBridgeContextProfilesApp extends AppBase {
  static override DEFAULT_OPTIONS: AnyRecord = {
    id: "lorebridge-context-profiles",
    window: { title: "Configure Context Profiles" },
    position: { width: 720, height: "auto" },
    actions: {
      "new-profile": LoreBridgeContextProfilesApp._onNewProfile,
      "edit-profile": LoreBridgeContextProfilesApp._onEditProfile,
      "delete-profile": LoreBridgeContextProfilesApp._onDeleteProfile,
      "duplicate-profile": LoreBridgeContextProfilesApp._onDuplicateProfile,
      "activate-profile": LoreBridgeContextProfilesApp._onActivateProfile,
      "clear-active": LoreBridgeContextProfilesApp._onClearActive,
      "preview-profile": LoreBridgeContextProfilesApp._onPreviewProfile,
    },
  };

  static override PARTS: AnyRecord = {
    form: { template: "modules/lorebridge/templates/context-profiles.hbs" },
  };

  async _prepareContext(_options?: AnyRecord): Promise<AnyRecord> {
    const profiles = getContextProfiles();
    const activeId = getActiveProfileId();
    const visLabel = (v: ContextProfileVisibility) =>
      v === "player-safe" ? "Player-visible" : v === "gm-only" ? "GM-only" : "All";
    const typeLabel = (t: ContextProfileDocType[]) => {
      const m: Record<ContextProfileDocType, string> = { journal: "Journals", actor: "Actors", scene: "Scenes" };
      return t.map((x) => m[x]).join(", ") || "None";
    };
    const rows = profiles.map((p) => {
      const folderCount = p.allowedFolderIds?.length ?? 0;
      return {
        id: p.id,
        name: p.name,
        typesLabel: typeLabel(p.allowedDocTypes),
        visibilityLabel: visLabel(p.visibilityMode),
        maxDocs: p.maxDocs,
        isActive: p.id === activeId,
        folderLabel: folderCount > 0 ? `${folderCount} folder${folderCount !== 1 ? "s" : ""}` : "",
        hasStaleFolder: hasStaleFolderRefs(p),
      };
    });
    const activeProfile = profiles.find((p) => p.id === activeId);
    return {
      profiles: rows,
      hasProfiles: rows.length > 0,
      hasActive: Boolean(activeId && activeProfile),
      activeProfileName: activeProfile?.name ?? "",
    };
  }

  static _onNewProfile(this: LoreBridgeContextProfilesApp): void {
    openProfileDialog(null, async (profile) => {
      const profiles = getContextProfiles();
      profiles.push(profile);
      await saveContextProfiles(profiles);
      await (this as unknown as AppV2Instance).render();
    });
  }

  static _onEditProfile(
    this: LoreBridgeContextProfilesApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): void {
    const id = target.dataset["id"];
    if (!id) return;
    const profiles = getContextProfiles();
    const existing = profiles.find((p) => p.id === id);
    if (!existing) return;
    openProfileDialog(existing, async (updated) => {
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx >= 0) profiles[idx] = updated;
      await saveContextProfiles(profiles);
      await (this as unknown as AppV2Instance).render();
    });
  }

  static async _onDeleteProfile(
    this: LoreBridgeContextProfilesApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset["id"];
    if (!id) return;
    const profiles = getContextProfiles();
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    const DialogV2 = foundryApi?.DialogV2;
    if (DialogV2) {
      const confirmed = await DialogV2.confirm({
        window: { title: "Delete Profile" },
        content: `<p>Delete profile <strong>${escapeHtml(profile.name)}</strong>? This cannot be undone.</p>`,
        yes: { label: "Delete" },
        no: { label: "Cancel", default: true },
        rejectClose: false,
      } as AnyRecord);
      if (!confirmed) return;
    }
    const updated = profiles.filter((p) => p.id !== id);
    await saveContextProfiles(updated);
    if (getActiveProfileId() === id) await setActiveProfileId("");
    await (this as unknown as AppV2Instance).render();
  }

  static async _onDuplicateProfile(
    this: LoreBridgeContextProfilesApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset["id"];
    if (!id) return;
    const profiles = getContextProfiles();
    const source = profiles.find((p) => p.id === id);
    if (!source) return;
    const copy = makeProfile(
      `${source.name} (copy)`,
      [...source.allowedDocTypes],
      source.visibilityMode,
      source.maxDocs,
      undefined,
      source.includeActiveScene,
      source.excludedCompendiums ? [...source.excludedCompendiums] : undefined,
      source.allowedFolderIds ? [...source.allowedFolderIds] : undefined,
    );
    profiles.push(copy);
    await saveContextProfiles(profiles);
    await (this as unknown as AppV2Instance).render();
  }

  static async _onPreviewProfile(
    this: LoreBridgeContextProfilesApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset["id"];
    if (!id) return;
    const profiles = getContextProfiles();
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    const filter = getProfileFilter(profile);
    const docs = gatherDocuments(undefined, filter, profile.includeActiveScene);
    const journalCount = docs.filter((d) => d.type === "journal-page").length;
    const actorCount = docs.filter((d) => d.type === "actor").length;
    const sceneCount = docs.filter((d) => d.type === "scene").length;
    const breakdownParts: string[] = [];
    if (journalCount > 0) breakdownParts.push(`${journalCount} journal page${journalCount !== 1 ? "s" : ""}`);
    if (actorCount > 0) breakdownParts.push(`${actorCount} actor${actorCount !== 1 ? "s" : ""}`);
    if (sceneCount > 0) breakdownParts.push(`${sceneCount} scene${sceneCount !== 1 ? "s" : ""}`);
    const sampleItems = docs.slice(0, 10).map((d) => `<li>${escapeHtml(d.name)}</li>`).join("");
    const sampleHtml = sampleItems
      ? `<ul style="margin:6px 0;padding-left:20px;font-size:12px">${sampleItems}</ul>`
      : `<p style="color:#888;font-size:12px;margin:6px 0">No matching documents found.</p>`;
    const content = `<div style="padding:4px 0">
      <p style="margin:0 0 6px"><strong>${escapeHtml(profile.name)}</strong> would scope to <strong>${docs.length}</strong> document${docs.length !== 1 ? "s" : ""} (max ${profile.maxDocs}).</p>
      ${breakdownParts.length > 0 ? `<p style="margin:0 0 6px;font-size:12px;color:#555">${breakdownParts.join(", ")}</p>` : ""}
      <p style="margin:0 0 4px;font-size:12px;color:#888">First ${Math.min(10, docs.length)} matching documents:</p>
      ${sampleHtml}
    </div>`;
    const DialogV2 = foundryApi?.DialogV2;
    if (DialogV2) {
      await DialogV2.prompt({
        window: { title: `Preview: ${profile.name}` },
        content,
        ok: { label: "Close", callback: () => null },
        rejectClose: false,
      } as AnyRecord);
    }
  }

  static async _onActivateProfile(
    this: LoreBridgeContextProfilesApp,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset["id"] ?? "";
    await setActiveProfileId(id);
    await (this as unknown as AppV2Instance).render();
  }

  static async _onClearActive(this: LoreBridgeContextProfilesApp): Promise<void> {
    await setActiveProfileId("");
    await (this as unknown as AppV2Instance).render();
  }
}
