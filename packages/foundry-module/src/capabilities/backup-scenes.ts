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

type FoundryFolder = {
  id: string;
  name: string;
  type: string;
  sort?: number;
  folder?: { id: string } | null;
  getFlag?(scope: string, key: string): unknown;
  setFlag?(scope: string, key: string, value: unknown): Promise<void>;
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
// Folder tree helpers
// ---------------------------------------------------------------------------

/**
 * Builds a Set of folder IDs rooted at `rootId` (inclusive of all
 * descendants) using a pre-built id→folder map.
 */
function collectSubtreeIds(
  rootId: string,
  folderById: Map<string, FoundryFolder>,
): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, f] of folderById) {
      if (!ids.has(id) && f.folder?.id && ids.has(f.folder.id)) {
        ids.add(id);
        changed = true;
      }
    }
  }
  return ids;
}

type FolderCollection = {
  contents?: unknown[];
  get?(id: string): unknown;
};

/**
 * Returns a Map<id, FoundryFolder> seeded from three sources in order:
 *   1. game.folders.contents (when Foundry's Collection array is populated)
 *   2. scene.folder references (immediate parents, always available)
 *   3. Ancestor lookups via game.folders.get(id) for each discovered parent ID
 *
 * Source 3 is the key one: it uses the native Map.get() which works even
 * when iteration/contents are unreliable, allowing us to climb from a leaf
 * folder (e.g. "Battle Maps") up to the root (e.g. "Barovia").
 */
function buildFolderMap(scenes: FoundryScene[]): Map<string, FoundryFolder> {
  const map = new Map<string, FoundryFolder>();
  const gFolders = (game as unknown as { folders?: FolderCollection }).folders;

  // Source 1: contents array (may or may not be populated)
  for (const raw of gFolders?.contents ?? []) {
    const f = raw as FoundryFolder;
    if (f?.id) map.set(f.id, f);
  }

  // Source 2: scene.folder references
  for (const scene of scenes) {
    const sf = scene.folder as unknown as FoundryFolder | null | undefined;
    if (sf?.id && !map.has(sf.id)) map.set(sf.id, sf);
  }

  // Source 3: walk parent IDs upward via game.folders.get()
  if (gFolders?.get) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of Array.from(map.values())) {
        const parentId = f.folder?.id;
        if (parentId && !map.has(parentId)) {
          const parent = gFolders.get(parentId) as FoundryFolder | undefined;
          if (parent?.id) {
            map.set(parent.id, parent);
            changed = true;
          }
        }
      }
    }
  }

  return map;
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
  const seenFolderIds = new Set<string>();
  const folderResourceFiles: BackupFileEntry[] = [];

  // Build a full folder map (game.folders.contents + scene.folder refs).
  const allScenes = Array.from(game.scenes);
  const folderById = buildFolderMap(allScenes);

  // Find the root folder by name (prefer Scene type; fall back to any type).
  const allFolders = Array.from(folderById.values());
  const rootFolder =
    allFolders.find((f) => f.name === folderName && f.type === "Scene") ??
    allFolders.find((f) => f.name === folderName);

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Scenes. Check the folder name and try again.`,
    );
  }

  // Collect the root folder and every descendant folder ID.
  const targetFolderIds = collectSubtreeIds(rootFolder.id, folderById);

  // Keep scenes whose immediate parent folder is in the subtree.
  const scenes = allScenes.filter(
    (s) => s.folder?.id && targetFolderIds.has(s.folder.id),
  );

  if (scenes.length === 0) {
    throw new Error(
      `No scenes found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

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

    // Resolve the folder resource ID.
    let folderExtId: string | undefined;
    const folderId = scene.folder?.id;
    const folderName_ = scene.folder?.name;

    if (folderId && !seenFolderIds.has(folderId)) {
      seenFolderIds.add(folderId);

      const foundryFolder = folderId ? folderById.get(folderId) : undefined;

      if (foundryFolder) {
        folderExtId = foundryFolder.getFlag
          ? (foundryFolder.getFlag(MODULE_ID, FLAG_FOLDER_RAVENS_EYE_ID) as
              | string
              | undefined)
          : undefined;
        if (!folderExtId || !folderExtId.startsWith("foundry-folder:")) {
          folderExtId = `foundry-folder:${crypto.randomUUID()}`;
          if (foundryFolder.setFlag) {
            try {
              await foundryFolder.setFlag(
                MODULE_ID,
                FLAG_FOLDER_RAVENS_EYE_ID,
                folderExtId,
              );
            } catch {
              warnings.push(
                `Could not persist folder ID for "${folderName_}" — it will change on the next export.`,
              );
            }
          }
        }

        // Build the folder resource YAML.
        const folderResource: Record<string, unknown> = {
          id: folderExtId,
          type: "folder",
          sourceDocument: {
            type: "Folder",
            id: folderId,
            uuid: `Folder.${folderId}`,
          },
          documentType: "Scene",
          name: folderName_ ?? "Unknown Folder",
          sort: foundryFolder.sort ?? 0,
        };

        const folderYaml = toYamlDoc(folderResource);
        const folderFilePath = `extensions/org.ravens-eye.foundry-vtt/folders/foundry-folder-${folderId}.yaml`;
        folderResourceFiles.push({ path: folderFilePath, content: folderYaml });
      } else {
        folderExtId = `foundry-folder:${crypto.randomUUID()}`;
        warnings.push(
          `Could not resolve folder document for "${folderName_}" — folder resource ID may be unstable.`,
        );
      }
    }

    // Resolve background src (v14 uses firstLevel; fall back to background).
    const backgroundSrc =
      scene.firstLevel?.background?.src ?? scene.background?.src ?? "";
    if (backgroundSrc) {
      warnings.push(
        `Asset inventoried (not exported): ${backgroundSrc} (scene "${scene.name}")`,
      );
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
      ...(folderExtId ? { folder: folderExtId } : {}),
      place: placeId,
      structure: {
        foundrySourceData: {
          name: scene.name,
          navigation: scene.navigation,
          grid: {
            type:
              (scene as unknown as { grid?: { type?: number } }).grid?.type ??
              1,
            size:
              (scene as unknown as { grid?: { size?: number } }).grid?.size ??
              100,
            distance:
              (scene as unknown as { grid?: { distance?: number } }).grid
                ?.distance ?? 5,
            units:
              (scene as unknown as { grid?: { units?: string } }).grid?.units ??
              "ft",
          },
          background: { src: backgroundSrc },
          walls: [],
          lights: [],
          drawings: [],
          tiles: [],
          regions: [],
          tokens: [],
        },
      },
    };

    if (scene.tokens && Array.from(scene.tokens).length > 0) {
      warnings.push(
        `Scene "${scene.name}" tokens are not exported in this backup (future feature).`,
      );
    }
    if (scene.notes && Array.from(scene.notes).length > 0) {
      warnings.push(
        `Scene "${scene.name}" notes/pins are not exported in this backup (future feature).`,
      );
    }

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
