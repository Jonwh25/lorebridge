/**
 * Scene folder backup — serializes Foundry Scene documents from a named
 * folder into Raven's Eye portable markdown files (core place records) and
 * Foundry fidelity sidecar YAML files.
 *
 * Stable IDs are generated once per document and stored in Foundry flags so
 * they persist across subsequent exports.
 *
 * Asset binaries are NOT copied — only their paths are recorded in warnings.
 */

import { RAVENS_EYE_SPEC_VERSION } from "@lorebridge/shared";
import type { BackupFileEntry } from "@lorebridge/shared/capabilities";
import { toYamlDoc } from "./backup-yaml.js";
import { buildFolderMap, collectSubtreeIds, findRootFolder, type FoundryFolder } from "./backup-folders.js";

const MODULE_ID = "lorebridge";
const FLAG_SCENE_RAVENS_EYE_ID = "sceneRavensEyeId";
const FLAG_FOLDER_RAVENS_EYE_ID = "folderRavensEyeId";

// ---------------------------------------------------------------------------
// Extended Foundry types
// ---------------------------------------------------------------------------

type SceneWithFlags = FoundryScene & {
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "unnamed";
}

function buildCampaignManifest(): string {
  const worldId = game.world?.id ?? "unknown";
  const worldTitle = game.world?.title ?? "Unknown Campaign";
  const systemId = game.system?.id ?? "unknown";

  const idHash = Array.from(worldId + "-campaign").reduce(
    (acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0,
    0,
  );
  const h = Math.abs(idHash).toString(16).padStart(8, "0");
  const campaignUuid = `${h.slice(0, 8)}-${h.slice(0, 4)}-4${h.slice(1, 4)}-8${h.slice(0, 3)}-${h.slice(0, 12).padStart(12, "0")}`;
  const campaignId = `campaign:${campaignUuid}`;

  const manifest: Record<string, unknown> = {
    specification: RAVENS_EYE_SPEC_VERSION,
    id: campaignId,
    name: worldTitle,
    playFormat: "campaign",
    coverage: "partial",
    gameSystem: {
      id: systemId,
      rulesRevision: "unknown",
      extensionVersion: RAVENS_EYE_SPEC_VERSION,
    },
  };
  return toYamlDoc(manifest);
}

function buildPlaceFrontmatter(placeId: string, name: string): string {
  const meta: Record<string, unknown> = {
    specification: RAVENS_EYE_SPEC_VERSION,
    id: placeId,
    name,
    type: "place",
    audience: "facilitator",
  };
  const lines = Object.entries(meta).map(([k, v]) =>
    k === "specification" ? `${k}: ${JSON.stringify(v)}` : `${k}: ${String(v)}`,
  );
  return `---\n# ravens-eye-metadata\n${lines.join("\n")}\n---\n`;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Exports all Scene documents from the named folder (and all subfolders) to
 * Raven's Eye files.  Returns the list of files to commit and any warnings
 * (including inventoried asset paths that are NOT exported as binaries).
 */
export async function exportSceneFolder(
  folderName: string,
): Promise<{ files: BackupFileEntry[]; warnings: string[] }> {
  if (!game.scenes) {
    throw new Error("The Foundry scene collection is unavailable.");
  }

  const warnings: string[] = [];
  const files: BackupFileEntry[] = [];
  const folderResourceFiles: BackupFileEntry[] = [];
  // Maps Foundry folder ID → sidecar ID for all folders in the subtree.
  const folderSidecarIds = new Map<string, string>();

  // Build a full folder map (game.folders.contents + scene.folder refs).
  const allScenes = Array.from(game.scenes);
  const folderById = buildFolderMap(
    allScenes.map((s) => s.folder as unknown as FoundryFolder | null),
  );

  // Find the root folder by name (prefer Scene type; fall back to any type).
  const rootFolder = findRootFolder(folderName, folderById, "Scene");

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Scenes. Check the folder name and try again.`,
    );
  }

  // Collect the root folder and every descendant folder ID.
  // Filter to Scene-type folders only — other types (JournalEntry, Actor, etc.)
  // can share the same parent IDs and would otherwise be picked up incorrectly.
  // Strict Scene-type filter — do NOT use !f.type as a fallback, because
  // non-Scene folders (Actor, JournalEntry, etc.) may have undefined type on
  // our cast and would incorrectly pass through.
  const sceneFolderById = new Map(
    Array.from(folderById.entries()).filter(([, f]) => f.type === "Scene"),
  );
  const targetFolderIds = collectSubtreeIds(rootFolder.id, sceneFolderById);

  // Keep scenes whose immediate parent folder is in the subtree.
  const scenes = allScenes.filter(
    (s) => s.folder?.id && targetFolderIds.has(s.folder.id),
  );

  if (scenes.length === 0) {
    throw new Error(
      `No scenes found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Assign stable sidecar IDs to ALL subfolders in the subtree.
  // This must happen before building YAMLs so parent IDs can be resolved.
  // The root folder itself is the restore target and is NOT exported.
  // ---------------------------------------------------------------------------
  for (const folderId of targetFolderIds) {
    if (folderId === rootFolder.id) continue;

    const foundryFolder = folderById.get(folderId);
    if (!foundryFolder) continue;

    let folderExtId = foundryFolder.getFlag
      ? (foundryFolder.getFlag(MODULE_ID, FLAG_FOLDER_RAVENS_EYE_ID) as string | undefined)
      : undefined;
    if (!folderExtId || !folderExtId.startsWith("foundry-folder:")) {
      folderExtId = `foundry-folder:${crypto.randomUUID()}`;
      if (foundryFolder.setFlag) {
        try {
          await foundryFolder.setFlag(MODULE_ID, FLAG_FOLDER_RAVENS_EYE_ID, folderExtId);
        } catch {
          warnings.push(`Could not persist folder ID for "${foundryFolder.name}" — it will change on the next export.`);
        }
      }
    }
    folderSidecarIds.set(folderId, folderExtId);
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Write folder YAML files, recording parent relationships so the
  // full hierarchy can be reconstructed on restore.
  // ---------------------------------------------------------------------------
  for (const folderId of targetFolderIds) {
    if (folderId === rootFolder.id) continue;

    const foundryFolder = folderById.get(folderId);
    if (!foundryFolder) continue;
    // Belt-and-suspenders: skip any non-Scene folder that slipped through.
    if (foundryFolder.type && foundryFolder.type !== "Scene") continue;

    const folderExtId = folderSidecarIds.get(folderId)!;
    const parentId = foundryFolder.folder?.id;
    // Intermediate parent (not root): record its sidecar ID so the hierarchy
    // can be rebuilt on restore. Direct children of root have no parentFolderSidecarId.
    const parentSidecarId =
      parentId && parentId !== rootFolder.id ? folderSidecarIds.get(parentId) : undefined;

    const folderResource: Record<string, unknown> = {
      id: folderExtId,
      type: "folder",
      sourceDocument: {
        type: "Folder",
        id: folderId,
        uuid: `Folder.${folderId}`,
      },
      documentType: "Scene",
      rootFolderName: folderName,
      name: foundryFolder.name ?? "Unknown Folder",
      sort: foundryFolder.sort ?? 0,
      ...(parentSidecarId ? { parentFolderSidecarId: parentSidecarId } : {}),
    };

    folderResourceFiles.push({
      path: `extensions/org.ravens-eye.foundry-vtt/folders/foundry-folder-${folderId}.yaml`,
      content: toYamlDoc(folderResource),
    });
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Export scenes.
  // ---------------------------------------------------------------------------
  for (const scene of scenes) {
    const sExt = scene as unknown as SceneWithFlags;

    // Get or generate a stable place ID for the core record.
    let placeId = sExt.getFlag(MODULE_ID, "placeRavensEyeId") as string | undefined;
    if (!placeId || !placeId.startsWith("place:")) {
      placeId = `place:${crypto.randomUUID()}`;
      try {
        await sExt.setFlag(MODULE_ID, "placeRavensEyeId", placeId);
      } catch {
        warnings.push(
          `Could not persist place ID for scene "${scene.name}" — it will change on the next export.`,
        );
      }
    }

    // Get or generate a stable Foundry scene extension ID.
    let sceneExtId = sExt.getFlag(MODULE_ID, FLAG_SCENE_RAVENS_EYE_ID) as
      | string
      | undefined;
    if (!sceneExtId || !sceneExtId.startsWith("foundry-scene:")) {
      sceneExtId = `foundry-scene:${crypto.randomUUID()}`;
      try {
        await sExt.setFlag(MODULE_ID, FLAG_SCENE_RAVENS_EYE_ID, sceneExtId);
      } catch {
        warnings.push(
          `Could not persist scene extension ID for scene "${scene.name}" — it will change on the next export.`,
        );
      }
    }

    // Resolve the folder sidecar ID for this scene's parent folder.
    const folderId = scene.folder?.id;
    const folderExtId = folderId ? folderSidecarIds.get(folderId) : undefined;

    // Serialize the complete Foundry scene document for full restore fidelity.
    // toObject() returns a plain JS object with all embedded collections
    // (walls, lights, tiles, drawings, notes, sounds, tokens, regions, etc.).
    const rawSceneData = (scene as unknown as { toObject(): Record<string, unknown> }).toObject();

    // Strip fields that must not be restored verbatim:
    //   _id    — Foundry assigns a new ID on import; restoring the old one
    //            causes UUID collisions when the original scene still exists.
    //   thumb  — auto-generated by Foundry; regenerated after restore.
    //   _stats — internal Foundry housekeeping metadata.
    const {
      _id: _stripId,
      thumb: _stripThumb,
      _stats: _stripStats,
      ...foundrySourceData
    } = rawSceneData;

    // Inventory asset paths (backgrounds, tiles, etc.) for user awareness.
    const backgroundSrc =
      (foundrySourceData.background as Record<string, unknown> | undefined)?.src as string ?? "";
    if (backgroundSrc) {
      warnings.push(`Asset inventoried (not exported): ${backgroundSrc} (scene "${scene.name}")`);
    }

    // Build the Foundry scene sidecar YAML.
    const sceneResource: Record<string, unknown> = {
      id: sceneExtId,
      type: "scene",
      sourceDocument: {
        type: "Scene",
        id: scene.id,
        uuid: `Scene.${scene.id}`,
      },
      profile: "structure",
      rootFolderName: folderName,
      ...(folderExtId ? { folder: folderExtId } : {}),
      place: placeId,
      structure: {
        foundrySourceData,
      },
    };

    const sceneYaml = toYamlDoc(sceneResource);
    const sceneUuidPart = sceneExtId.replace("foundry-scene:", "");
    const sceneFilePath = `extensions/org.ravens-eye.foundry-vtt/scenes/foundry-scene-${sceneUuidPart}.yaml`;
    files.push({ path: sceneFilePath, content: sceneYaml });

    // Build the core place markdown record.
    const frontmatter = buildPlaceFrontmatter(placeId, scene.name);
    const placeContent = `${frontmatter}\n# ${scene.name}\n\n_Foundry scene backup. See the sidecar YAML for reconstruction data._\n`;
    const placeFilePath = `place/${slugify(scene.name)}.md`;
    files.push({ path: placeFilePath, content: placeContent });
  }

  // Prepend campaign manifest and folder resources.
  const allFiles: BackupFileEntry[] = [
    { path: "ravens-eye.yaml", content: buildCampaignManifest() },
    ...folderResourceFiles,
    ...files,
  ];

  return { files: allFiles, warnings };
}
