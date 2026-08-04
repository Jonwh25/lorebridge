/**
 * Actor folder backup — serializes Foundry Actor documents from a named
 * folder (and all subfolders) into:
 *   - Raven's Eye portable character identity markdown files
 *   - Foundry fidelity sidecar YAML files (full toObject() data for restore)
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
const FLAG_ACTOR_RAVENS_EYE_ID = "actorRavensEyeId";
const FLAG_ACTOR_EXT_ID = "actorExtId";
const FLAG_FOLDER_RAVENS_EYE_ID = "folderRavensEyeId";

// ---------------------------------------------------------------------------
// Extended Foundry types
// ---------------------------------------------------------------------------

type ActorWithFlags = FoundryActor & {
  toObject(): Record<string, unknown>;
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

function buildCharacterFrontmatter(charId: string, name: string): string {
  const meta: Record<string, unknown> = {
    specification: RAVENS_EYE_SPEC_VERSION,
    id: charId,
    name,
    type: "character",
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
 * Exports all Actor documents from the named folder (and all subfolders) to:
 *   - Raven's Eye character identity markdown files
 *   - Foundry sidecar YAML files (complete toObject() data for full restore)
 *
 * Called from the `/lb backup actors <folderName>` chat command.
 */
export async function exportActorFolder(
  folderName: string,
): Promise<{ files: BackupFileEntry[]; warnings: string[] }> {
  if (!game.actors) {
    throw new Error("The Foundry actor collection is unavailable.");
  }

  const warnings: string[] = [];
  const files: BackupFileEntry[] = [];
  const seenFolderIds = new Set<string>();
  const folderResourceFiles: BackupFileEntry[] = [];

  const allActors = Array.from(game.actors);
  const folderById = buildFolderMap(
    allActors.map((a) => a.folder as unknown as FoundryFolder | null),
  );

  const rootFolder = findRootFolder(folderName, folderById, "Actor");

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Actors. Check the folder name and try again.`,
    );
  }

  const targetFolderIds = collectSubtreeIds(rootFolder.id, folderById);

  const actors = allActors.filter(
    (a) => a.folder?.id && targetFolderIds.has(a.folder.id),
  );

  if (actors.length === 0) {
    throw new Error(
      `No actors found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

  for (const actor of actors) {
    const aExt = actor as unknown as ActorWithFlags;

    // Get or generate a stable Raven's Eye character ID.
    let charId = aExt.getFlag(MODULE_ID, FLAG_ACTOR_RAVENS_EYE_ID) as string | undefined;
    if (!charId || !charId.startsWith("character:")) {
      charId = `character:${crypto.randomUUID()}`;
      try {
        await aExt.setFlag(MODULE_ID, FLAG_ACTOR_RAVENS_EYE_ID, charId);
      } catch {
        warnings.push(
          `Could not persist character ID for actor "${actor.name}" — it will change on the next export.`,
        );
      }
    }

    // Get or generate a stable Foundry actor extension ID for the sidecar.
    let actorExtId = aExt.getFlag(MODULE_ID, FLAG_ACTOR_EXT_ID) as string | undefined;
    if (!actorExtId || !actorExtId.startsWith("foundry-actor:")) {
      actorExtId = `foundry-actor:${crypto.randomUUID()}`;
      try {
        await aExt.setFlag(MODULE_ID, FLAG_ACTOR_EXT_ID, actorExtId);
      } catch {
        warnings.push(
          `Could not persist sidecar ID for actor "${actor.name}" — it will change on the next export.`,
        );
      }
    }

    // Resolve and emit a folder resource YAML (once per folder).
    let folderExtId: string | undefined;
    const folderId = actor.folder?.id;
    const folderLabel = actor.folder?.name;

    if (folderId && !seenFolderIds.has(folderId)) {
      seenFolderIds.add(folderId);
      const foundryFolder = folderById.get(folderId);

      if (foundryFolder) {
        folderExtId = foundryFolder.getFlag
          ? (foundryFolder.getFlag(MODULE_ID, FLAG_FOLDER_RAVENS_EYE_ID) as string | undefined)
          : undefined;
        if (!folderExtId || !folderExtId.startsWith("foundry-folder:")) {
          folderExtId = `foundry-folder:${crypto.randomUUID()}`;
          if (foundryFolder.setFlag) {
            try {
              await foundryFolder.setFlag(MODULE_ID, FLAG_FOLDER_RAVENS_EYE_ID, folderExtId);
            } catch {
              warnings.push(
                `Could not persist folder ID for "${folderLabel}" — it will change on the next export.`,
              );
            }
          }
        }

        const folderResource: Record<string, unknown> = {
          id: folderExtId,
          type: "folder",
          sourceDocument: {
            type: "Folder",
            id: folderId,
            uuid: `Folder.${folderId}`,
          },
          documentType: "Actor",
          name: folderLabel ?? "Unknown Folder",
          sort: foundryFolder.sort ?? 0,
        };
        folderResourceFiles.push({
          path: `extensions/org.ravens-eye.foundry-vtt/folders/foundry-folder-${folderId}.yaml`,
          content: toYamlDoc(folderResource),
        });
      } else {
        folderExtId = `foundry-folder:${crypto.randomUUID()}`;
        warnings.push(
          `Could not resolve folder document for "${folderLabel}" — folder resource ID may be unstable.`,
        );
      }
    }

    // Serialize the complete Foundry actor document for full restore fidelity.
    // toObject() captures system data, items, active effects, and all embedded
    // collections — everything needed to recreate the actor.
    const rawData = aExt.toObject();

    // Strip fields that must not be restored verbatim:
    //   _id           — Foundry assigns a new ID on import.
    //   _stats        — internal Foundry housekeeping metadata.
    //   prototypeToken — dynamic token defaults; restored separately if needed.
    const {
      _id: _stripId,
      _stats: _stripStats,
      prototypeToken,
      ...foundrySourceData
    } = rawData as Record<string, unknown> & { prototypeToken?: Record<string, unknown> };

    // Inventory asset paths so the GM knows what to copy manually.
    const portraitSrc = (foundrySourceData.img as string | undefined) ?? "";
    if (portraitSrc && !portraitSrc.startsWith("icons/")) {
      warnings.push(`Asset inventoried (not exported): ${portraitSrc} (actor "${actor.name}" portrait)`);
    }
    const tokenSrc =
      (prototypeToken?.texture as Record<string, unknown> | undefined)?.src as string | undefined ?? "";
    if (tokenSrc && !tokenSrc.startsWith("icons/")) {
      warnings.push(`Asset inventoried (not exported): ${tokenSrc} (actor "${actor.name}" token art)`);
    }

    // Build the Foundry sidecar YAML.
    const sidecar: Record<string, unknown> = {
      id: actorExtId,
      type: "actor",
      sourceDocument: {
        type: "Actor",
        id: actor.id,
        uuid: `Actor.${actor.id}`,
      },
      ...(folderExtId ? { folder: folderExtId } : {}),
      character: charId,
      structure: { foundrySourceData },
    };

    const uuidPart = actorExtId.replace("foundry-actor:", "");
    files.push({
      path: `extensions/org.ravens-eye.foundry-vtt/actors/foundry-actor-${uuidPart}.yaml`,
      content: toYamlDoc(sidecar),
    });

    // Build the portable Raven's Eye character markdown.
    const frontmatter = buildCharacterFrontmatter(charId, actor.name);
    const actorType = actor.type ?? "unknown";
    files.push({
      path: `character/${slugify(actor.name)}.md`,
      content: `${frontmatter}\n# ${actor.name}\n\nType: ${actorType}\n\n_Foundry actor backup. See the sidecar YAML for complete reconstruction data._\n`,
    });
  }

  const allFiles: BackupFileEntry[] = [
    { path: "ravens-eye.yaml", content: buildCampaignManifest() },
    ...folderResourceFiles,
    ...files,
  ];

  return { files: allFiles, warnings };
}
