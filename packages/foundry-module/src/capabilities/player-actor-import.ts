/**
 * Player-driven actor import from GitHub backup (Milestone 25, issue #228).
 *
 * A player with OWNER permission on an actor can open an import dialog from
 * the actor sheet header, browse character-type backup actors, and overwrite
 * only the actor they own. GM-only (NPC) actors are never exposed.
 */

const MODULE_ID = "lorebridge";

// ---------------------------------------------------------------------------
// Foundry type aliases
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

type FoundryUserExt = {
  isGM: boolean;
  id: string;
  name: string;
};

type FoundryActorExt = {
  id: string;
  name: string;
  type: string;
  testUserPermission(user: FoundryUserExt, permission: string | number): boolean;
  update(data: AnyRecord): Promise<void>;
};

type DialogV2Api = {
  prompt(cfg: AnyRecord): Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Settings access
// ---------------------------------------------------------------------------

type RawSettings = { get(module: string, key: string): unknown };

function getSettings(): { backendUrl: string; clientToken: string } {
  const s = (game.settings as unknown as RawSettings);
  return {
    backendUrl: String(s.get(MODULE_ID, "backendUrl") ?? "").trim(),
    clientToken: String(s.get(MODULE_ID, "clientToken") ?? ""),
  };
}

// ---------------------------------------------------------------------------
// DialogV2
// ---------------------------------------------------------------------------

function getDialogV2(): DialogV2Api | undefined {
  return (
    (globalThis as unknown as { foundry?: { applications?: { api?: { DialogV2?: DialogV2Api } } } })
      .foundry?.applications?.api?.DialogV2
  );
}

// ---------------------------------------------------------------------------
// Backend calls
// ---------------------------------------------------------------------------

function buildUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

interface BackupActorEntry {
  path: string;
  name: string;
  actorType: string;
}

async function fetchActorBackupList(): Promise<BackupActorEntry[]> {
  const { backendUrl, clientToken } = getSettings();
  if (!backendUrl || !clientToken) throw new Error("LoreBridge backend is not configured or paired.");

  const response = await fetch(buildUrl(backendUrl, "v1/player/actor-backups"), {
    headers: { authorization: `Bearer ${clientToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = await response.json() as { actors: BackupActorEntry[] };
  return data.actors ?? [];
}

async function fetchActorImportData(path: string): Promise<AnyRecord> {
  const { backendUrl, clientToken } = getSettings();
  if (!backendUrl || !clientToken) throw new Error("LoreBridge backend is not configured or paired.");

  const url = buildUrl(backendUrl, `v1/player/actor-import?path=${encodeURIComponent(path)}`);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${clientToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = await response.json() as { foundrySourceData: AnyRecord };
  return data.foundrySourceData;
}

// ---------------------------------------------------------------------------
// Permission check
// ---------------------------------------------------------------------------

const OWNER_PERMISSION = 3;

function isActorOwner(actor: FoundryActorExt): boolean {
  const user = game.user as unknown as FoundryUserExt | undefined;
  if (!user || user.isGM) return false;
  return actor.testUserPermission(user, OWNER_PERMISSION);
}

// ---------------------------------------------------------------------------
// Import dialog
// ---------------------------------------------------------------------------

export async function openPlayerActorImportDialog(actorId: string): Promise<void> {
  const actor = (game.actors as unknown as { get(id: string): FoundryActorExt | undefined }).get(actorId);
  if (!actor) {
    ui.notifications.warn("LoreBridge: Actor not found.");
    return;
  }

  if (!isActorOwner(actor)) {
    ui.notifications.warn("LoreBridge: You must own this actor to import a backup.");
    return;
  }

  const DialogV2 = getDialogV2();
  if (!DialogV2) {
    ui.notifications.error("LoreBridge: DialogV2 is unavailable.");
    return;
  }

  // Step 1 — Fetch the list of available backup actors
  let backupList: BackupActorEntry[];
  try {
    backupList = await fetchActorBackupList();
  } catch (err) {
    ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Failed to load backup list."}`);
    return;
  }

  if (backupList.length === 0) {
    ui.notifications.info("LoreBridge: No character backups found. Ask your GM to back up characters first.");
    return;
  }

  // Step 2 — Show selection dialog
  const optionsHtml = backupList.map((entry, i) => {
    const safeName = entry.name.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `<option value="${i}">${safeName}</option>`;
  }).join("");

  let selectedIndex = -1;
  let confirmed = false;

  await DialogV2.prompt({
    window: { title: "Import Character from Backup", resizable: true },
    content: `
      <div style="padding:8px;font-size:0.9em">
        <p style="margin:0 0 8px;color:#aaa">
          Select a character backup to import into <strong>${actor.name.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</strong>.
          This will overwrite the actor's current data. Only characters (not NPCs) are listed.
        </p>
        <div style="margin-bottom:10px">
          <label style="font-weight:bold;font-size:0.85em;display:block;margin-bottom:4px">
            Available character backups
          </label>
          <select name="backup" style="width:100%;padding:5px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd">
            ${optionsHtml}
          </select>
        </div>
        <p style="margin:4px 0 0;font-size:0.8em;color:#a44">
          Warning: this will overwrite your current character data. Make sure you have selected the correct backup.
        </p>
      </div>`,
    ok: {
      label: "Import",
      icon: "fas fa-file-import",
      callback: (_event: Event, button: HTMLButtonElement) => {
        const form = button.closest("form") ?? button.form ?? button.closest(".dialog-content");
        const sel = form?.querySelector<HTMLSelectElement>("select[name='backup']");
        selectedIndex = sel ? parseInt(sel.value, 10) : -1;
        confirmed = true;
      },
    },
    rejectClose: false,
  });

  if (!confirmed || selectedIndex < 0) return;

  const selected = backupList[selectedIndex];
  if (!selected) return;

  // Step 3 — Confirm overwrite
  let overwriteConfirmed = false;
  const safeActorName = actor.name.replace(/&/g,"&amp;").replace(/</g,"&lt;");
  const safeBackupName = selected.name.replace(/&/g,"&amp;").replace(/</g,"&lt;");

  await DialogV2.prompt({
    window: { title: "Confirm Import" },
    content: `
      <p>Import <strong>${safeBackupName}</strong> into <strong>${safeActorName}</strong>?</p>
      <p style="color:#a44">This will overwrite the actor's current data. This action cannot be undone.</p>`,
    ok: {
      label: "Confirm Import",
      icon: "fas fa-check",
      callback: () => { overwriteConfirmed = true; },
    },
    rejectClose: false,
  });

  if (!overwriteConfirmed) return;

  // Step 4 — Fetch and apply data
  try {
    const foundrySourceData = await fetchActorImportData(selected.path);

    // Re-check ownership before applying.
    if (!isActorOwner(actor)) {
      ui.notifications.error("LoreBridge: Actor ownership check failed. Import cancelled.");
      return;
    }

    // Apply the imported data without changing the actor _id.
    await actor.update(foundrySourceData);
    ui.notifications.info(`LoreBridge: Character "${selected.name}" imported successfully.`);
  } catch (err) {
    ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Import failed."}`);
  }
}

// ---------------------------------------------------------------------------
// Sheet header button registration (#228)
// Adds "Import from Backup" to the actor sheet header for non-GM owners only.
// ---------------------------------------------------------------------------

export function registerPlayerActorImportSheetHook(): void {
  Hooks.on("getHeaderControlsActorSheetV2", (...args: unknown[]) => {
    const [app, controls] = args as [{ document?: FoundryActorExt }, unknown[]];
    const user = game.user as unknown as FoundryUserExt | undefined;
    if (!user || user.isGM) return; // GM uses the GM restore path

    const actor = app.document;
    if (!actor) return;
    if (!isActorOwner(actor)) return;
    if (!actor.id) return;

    if ((controls as Array<{ class?: string }>).some(c => c.class === "lorebridge-player-import")) return;

    const capturedId = actor.id;
    controls.push({
      label: "Import from Backup",
      class: "lorebridge-player-import",
      icon: "fas fa-file-import",
      onClick: () => { void openPlayerActorImportDialog(capturedId); },
    });
  });
}
