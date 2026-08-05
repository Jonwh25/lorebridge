/**
 * Scene folder restore — reads backup sidecar YAMLs from GitHub (via the
 * backend), matches them against the current Foundry world state, shows a
 * GM-only preview dialog, and applies the changes on confirmation.
 *
 * Folder hierarchy: all backed-up subfolders are placed under the named root
 * folder (2-level restore).  The root folder is found by name or created.
 *
 * Conflict detection: scenes matched by the `placeRavensEyeId` flag are
 * updated; scenes where a different scene with the same name already exists
 * are flagged as conflicts and skipped.
 */

import { getLoreBridgeSettings } from "../settings.js";
import type { RestoreScenesOutput, RestoreFolderEntry, RestoreSceneEntry } from "@lorebridge/shared/capabilities";

const MODULE_ID = "lorebridge";
const FLAG_PLACE_RAVENS_EYE_ID = "placeRavensEyeId";
const FLAG_FOLDER_RAVENS_EYE_ID = "folderRavensEyeId";

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

type RestoreAction = "create" | "update" | "conflict";

interface RestorePlanItem {
  action: RestoreAction;
  sceneName: string;
  existingFoundryId?: string;
  conflictReason?: string;
  scene: RestoreSceneEntry;
}

// ---------------------------------------------------------------------------
// Backend fetch
// ---------------------------------------------------------------------------

async function fetchRestoreData(folderName: string, ref?: string): Promise<RestoreScenesOutput> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
  const params = new URLSearchParams({ folderName });
  if (ref) params.set("ref", ref);
  const url = `${base}v1/backup/github/restore/scenes?${params.toString()}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${settings.clientToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  return response.json() as Promise<RestoreScenesOutput>;
}

// ---------------------------------------------------------------------------
// Plan building
// ---------------------------------------------------------------------------

function buildRestorePlan(data: RestoreScenesOutput): RestorePlanItem[] {
  const sceneByPlaceId = new Map<string, FoundryScene>();
  const sceneByName = new Map<string, FoundryScene>();

  for (const scene of game.scenes) {
    const placeId = scene.getFlag(MODULE_ID, FLAG_PLACE_RAVENS_EYE_ID) as string | undefined;
    if (placeId) sceneByPlaceId.set(placeId, scene);
    sceneByName.set(scene.name.toLowerCase(), scene);
  }

  return data.scenes.map((entry) => {
    const byFlag = sceneByPlaceId.get(entry.placeId);
    if (byFlag) {
      return { action: "update" as const, sceneName: entry.sceneName, existingFoundryId: byFlag.id, scene: entry };
    }
    const byName = sceneByName.get(entry.sceneName.toLowerCase());
    if (byName) {
      return {
        action: "conflict" as const,
        sceneName: entry.sceneName,
        conflictReason: `A different scene named "${entry.sceneName}" already exists.`,
        scene: entry,
      };
    }
    return { action: "create" as const, sceneName: entry.sceneName, scene: entry };
  });
}

function buildFolderPlan(data: RestoreScenesOutput): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const allFolders = Array.from(game.folders);

  for (const folder of data.folders) {
    // Prefer flag match — exact and unambiguous even with duplicate names.
    const byFlag = allFolders.find(
      (f) => f.type === "Scene" && f.getFlag(MODULE_ID, FLAG_FOLDER_RAVENS_EYE_ID) === folder.sidecarId,
    );
    if (byFlag) { result.set(folder.sidecarId, byFlag.id); continue; }

    // Name fallback only when this sidecar name is unique in the backup so we
    // can't confuse two "Random Encounters" folders with each other.
    const nameCount = data.folders.filter((f) => f.name === folder.name).length;
    if (nameCount === 1) {
      const byName = allFolders.find((f) => f.type === "Scene" && f.name === folder.name);
      if (byName) { result.set(folder.sidecarId, byName.id); continue; }
    }

    result.set(folder.sidecarId, null);
  }
  return result;
}

/** Topological sort: parents before children. Cycles are broken by order. */
function topoSortFolders(folders: RestoreFolderEntry[]): RestoreFolderEntry[] {
  const byId = new Map(folders.map((f) => [f.sidecarId, f]));
  const sorted: RestoreFolderEntry[] = [];
  const visited = new Set<string>();

  function visit(f: RestoreFolderEntry): void {
    if (visited.has(f.sidecarId)) return;
    if (f.parentSidecarId && byId.has(f.parentSidecarId)) {
      visit(byId.get(f.parentSidecarId)!);
    }
    visited.add(f.sidecarId);
    sorted.push(f);
  }

  for (const f of folders) visit(f);
  return sorted;
}

// ---------------------------------------------------------------------------
// Preview dialog HTML
// ---------------------------------------------------------------------------

function buildPreviewHtml(
  folderName: string,
  plan: RestorePlanItem[],
  folderPlan: Map<string, string | null>,
  data: RestoreScenesOutput,
): string {
  const creates = plan.filter((p) => p.action === "create");
  const updates = plan.filter((p) => p.action === "update");
  const conflicts = plan.filter((p) => p.action === "conflict");
  const foldersToCreate = data.folders.filter((f) => folderPlan.get(f.sidecarId) === null);
  const shortSha = data.commitSha.slice(0, 7);
  const total = creates.length + updates.length;

  const section = (label: string, items: string[], color?: string) =>
    `<details style="margin-top:8px;"><summary style="cursor:pointer;font-weight:bold;${color ? `color:${color};` : ""}">${label} (${items.length})</summary><ul style="font-size:0.9em;margin-top:4px;">${items.map((i) => `<li>${i}</li>`).join("")}</ul></details>`;

  let html = `<div style="max-height:480px;overflow-y:auto;padding-right:4px;font-size:13px;line-height:1.5;">`;
  html += `<p><strong>LoreBridge — Restore Preview</strong></p>`;
  html += `<p>Folder: <strong>${folderName}</strong> (commit <code>${shortSha}</code>)</p>`;
  html += `<p>${total} scene(s) to restore, ${conflicts.length} conflict(s) to skip.</p>`;

  if (foldersToCreate.length > 0) {
    html += section(`Folders to create`, foldersToCreate.map((f) => f.name));
  }
  if (creates.length > 0) {
    html += section(`Scenes to create`, creates.map((p) => p.sceneName));
  }
  if (updates.length > 0) {
    html += section(`Scenes to update`, updates.map((p) => `${p.sceneName} <em>(replaces existing)</em>`));
  }
  if (conflicts.length > 0) {
    html += section(`Conflicts — will skip`, conflicts.map((p) => `${p.sceneName} — ${p.conflictReason ?? "name collision"}`), "#c0392b");
  }
  if (data.warnings.length > 0) {
    html += section(`Backup warnings`, data.warnings);
  }

  if (total === 0) {
    html += `<p style="color:#c0392b;margin-top:8px;">Nothing to restore — all scenes conflict or the folder had no scenes backed up.</p>`;
  } else {
    html += `<p style="margin-top:8px;font-size:0.85em;color:#888;">Conflicts are skipped. Updates overwrite existing scene data.</p>`;
  }

  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function applyRestore(
  folderName: string,
  plan: RestorePlanItem[],
  folderPlan: Map<string, string | null>,
  data: RestoreScenesOutput,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Step 1: resolve or create the root folder.
  let rootFolderId: string | null =
    Array.from(game.folders).find((f) => f.type === "Scene" && f.name === folderName)?.id ?? null;

  if (!rootFolderId) {
    const newRoot = await Folder.create({ name: folderName, type: "Scene", folder: null, sort: 0 });
    rootFolderId = newRoot?.id ?? null;
  }

  // Step 2: create missing subfolders in topological order (parents first).
  const resolvedFolderIds = new Map<string, string>();
  for (const [sidecarId, existingId] of folderPlan) {
    if (existingId !== null) { resolvedFolderIds.set(sidecarId, existingId); }
  }

  const toCreate = topoSortFolders(
    data.folders.filter((f): f is RestoreFolderEntry => folderPlan.get(f.sidecarId) === null),
  );
  for (const folder of toCreate) {
    // Place under the resolved parent, or under the root if parent is unknown.
    const parentId = folder.parentSidecarId
      ? (resolvedFolderIds.get(folder.parentSidecarId) ?? rootFolderId)
      : rootFolderId;
    const newFolder = await Folder.create({
      name: folder.name,
      type: "Scene",
      folder: parentId,
      sort: folder.sort,
    });
    if (newFolder) {
      resolvedFolderIds.set(folder.sidecarId, newFolder.id);
      try {
        await newFolder.setFlag(MODULE_ID, FLAG_FOLDER_RAVENS_EYE_ID, folder.sidecarId);
      } catch { /* best effort */ }
    }
  }

  // Step 3: create / update scenes.
  const scenesToThumb: FoundryScene[] = [];
  for (const item of plan) {
    if (item.action === "conflict") { skipped++; continue; }

    const targetFolderId = item.scene.folderSidecarId
      ? (resolvedFolderIds.get(item.scene.folderSidecarId) ?? rootFolderId)
      : rootFolderId;

    const sceneData: Record<string, unknown> = {
      ...item.scene.foundrySourceData,
      folder: targetFolderId,
    };

    if (item.action === "create") {
      const newScene = await Scene.create(sceneData);
      if (newScene) { created++; scenesToThumb.push(newScene); }
    } else if (item.action === "update" && item.existingFoundryId) {
      const existing = game.scenes.get(item.existingFoundryId);
      if (existing) {
        await existing.update(sceneData);
        updated++;
        scenesToThumb.push(existing);
      }
    }
  }

  // Step 4: regenerate thumbnails (best-effort, non-blocking).
  for (const scene of scenesToThumb) {
    try {
      const thumbData = await (scene as unknown as { createThumbnail(): Promise<{ thumb: string }> }).createThumbnail();
      await scene.update({ thumb: thumbData.thumb });
    } catch { /* thumbnails are non-critical */ }
  }

  return { created, updated, skipped };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function restoreSceneFolder(folderName: string, ref?: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: Restore is only available to GMs.");
    return;
  }

  ui.notifications.info(`LoreBridge: Fetching backup data for "${folderName}"…`);

  let data: RestoreScenesOutput;
  try {
    data = await fetchRestoreData(folderName, ref);
  } catch (error) {
    ui.notifications.error(
      `LoreBridge restore failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (data.scenes.length === 0) {
    ui.notifications.warn(
      `LoreBridge: No scenes found for folder "${folderName}" in the backup. Check the folder name and try again.`,
    );
    return;
  }

  const plan = buildRestorePlan(data);
  const folderPlan = buildFolderPlan(data);
  const dialogContent = buildPreviewHtml(folderName, plan, folderPlan, data);

  const capturedPlan = plan;
  const capturedFolderPlan = folderPlan;
  const capturedData = data;

  new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — Restore Preview", resizable: true },
    position: { width: 600, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "restore",
        label: "Restore",
        icon: "fas fa-download",
        default: true,
        callback: () => {
          void applyRestore(folderName, capturedPlan, capturedFolderPlan, capturedData)
            .then(({ created, updated, skipped }) => {
              const parts: string[] = [];
              if (created > 0) parts.push(`${created} created`);
              if (updated > 0) parts.push(`${updated} updated`);
              if (skipped > 0) parts.push(`${skipped} skipped (conflicts)`);
              const summary = parts.join(", ") || "nothing changed";
              ui.notifications.info(`LoreBridge: Restore complete — ${summary}.`);
              const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
              void ChatMessage.create({
                content: `<p><strong>LoreBridge Restore</strong> — Folder "${folderName}" from commit <code>${capturedData.commitSha.slice(0, 7)}</code>: ${summary}.</p>`,
                whisper: gmIds,
                speaker: { alias: "LoreBridge" },
                flags: {
                  [MODULE_ID]: { type: "restore", folderName, commitSha: capturedData.commitSha },
                },
              });
            })
            .catch((err: unknown) => {
              ui.notifications.error(
                `LoreBridge restore failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        },
      },
      { action: "cancel", label: "Cancel", icon: "fas fa-times" },
    ],
  }).render({ force: true });
}
