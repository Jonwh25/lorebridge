/**
 * Roll table folder backup — serializes Foundry RollTable documents from a
 * named folder (and all subfolders) into:
 *   - Raven's Eye portable random-table markdown files
 *   - Foundry fidelity sidecar YAML files (full toObject() data for restore)
 *
 * Stable IDs are generated once per document and stored in Foundry flags so
 * they persist across subsequent exports.
 *
 * Asset binaries (result images) are NOT copied — only paths are recorded.
 */

import { RAVENS_EYE_SPEC_VERSION } from "@lorebridge/shared";
import type { BackupFileEntry } from "@lorebridge/shared/capabilities";
import { toYamlDoc } from "./backup-yaml.js";
import { buildFolderMap, collectSubtreeIds, findRootFolder, type FoundryFolder } from "./backup-folders.js";

const MODULE_ID = "lorebridge";
const FLAG_TABLE_RAVENS_EYE_ID = "tableRavensEyeId";
const FLAG_TABLE_EXT_ID = "tableExtId";
const FLAG_FOLDER_RAVENS_EYE_ID = "folderRavensEyeId";

// ---------------------------------------------------------------------------
// Extended Foundry types
// ---------------------------------------------------------------------------

type RollTableWithFlags = FoundryRollTable & {
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

function buildTableFrontmatter(tableId: string, name: string): string {
  const meta: Record<string, unknown> = {
    specification: RAVENS_EYE_SPEC_VERSION,
    id: tableId,
    name,
    type: "random-table",
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
 * Exports all RollTable documents from the named folder (and all subfolders) to:
 *   - Raven's Eye random-table markdown files
 *   - Foundry sidecar YAML files (complete toObject() data for full restore)
 *
 * Called from the `/lb backup rolltables <folderName>` chat command.
 */
export async function exportRollTableFolder(
  folderName: string,
): Promise<{ files: BackupFileEntry[]; warnings: string[] }> {
  if (!game.tables) {
    throw new Error("The Foundry roll table collection is unavailable.");
  }

  const warnings: string[] = [];
  const files: BackupFileEntry[] = [];
  const seenFolderIds = new Set<string>();
  const folderResourceFiles: BackupFileEntry[] = [];

  const allTables = Array.from(game.tables);
  const folderById = buildFolderMap(
    allTables.map((t) => t.folder as unknown as FoundryFolder | null),
  );

  const rootFolder = findRootFolder(folderName, folderById, "RollTable");

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Roll Tables. Check the folder name and try again.`,
    );
  }

  const targetFolderIds = collectSubtreeIds(rootFolder.id, folderById);

  const tables = allTables.filter(
    (t) => t.folder?.id && targetFolderIds.has(t.folder.id),
  );

  if (tables.length === 0) {
    throw new Error(
      `No roll tables found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

  for (const table of tables) {
    const tExt = table as unknown as RollTableWithFlags;

    // Get or generate a stable Raven's Eye random-table ID.
    let tableId = tExt.getFlag(MODULE_ID, FLAG_TABLE_RAVENS_EYE_ID) as string | undefined;
    if (!tableId || !tableId.startsWith("random-table:")) {
      tableId = `random-table:${crypto.randomUUID()}`;
      try {
        await tExt.setFlag(MODULE_ID, FLAG_TABLE_RAVENS_EYE_ID, tableId);
      } catch {
        warnings.push(
          `Could not persist table ID for "${table.name}" — it will change on the next export.`,
        );
      }
    }

    // Get or generate a stable Foundry roll-table extension ID for the sidecar.
    let tableExtId = tExt.getFlag(MODULE_ID, FLAG_TABLE_EXT_ID) as string | undefined;
    if (!tableExtId || !tableExtId.startsWith("foundry-roll-table:")) {
      tableExtId = `foundry-roll-table:${crypto.randomUUID()}`;
      try {
        await tExt.setFlag(MODULE_ID, FLAG_TABLE_EXT_ID, tableExtId);
      } catch {
        warnings.push(
          `Could not persist sidecar ID for roll table "${table.name}" — it will change on the next export.`,
        );
      }
    }

    // Resolve and emit a folder resource YAML (once per folder).
    let folderExtId: string | undefined;
    const folderId = table.folder?.id;
    const folderLabel = table.folder?.name;

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
          documentType: "RollTable",
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

    // Serialize the complete Foundry roll table document for full restore.
    // toObject() captures formula, replacement mode, all results with ranges,
    // weights, text, and document references.
    const rawData = tExt.toObject();

    // Strip fields that must not be restored verbatim:
    //   _id    — Foundry assigns a new ID on import.
    //   _stats — internal Foundry housekeeping metadata.
    const {
      _id: _stripId,
      _stats: _stripStats,
      ...foundrySourceData
    } = rawData as Record<string, unknown>;

    // Inventory result image assets for user awareness.
    const results = (foundrySourceData.results as Array<Record<string, unknown>> | undefined) ?? [];
    for (const result of results) {
      const imgSrc = result.img as string | undefined;
      if (imgSrc && !imgSrc.startsWith("icons/")) {
        // Use description (renamed from text in Foundry v13).
        const label = String(result.description ?? "").slice(0, 40);
        warnings.push(
          `Asset inventoried (not exported): ${imgSrc} (roll table "${table.name}", result "${label}")`,
        );
      }
    }

    // Build the Foundry sidecar YAML.
    const sidecar: Record<string, unknown> = {
      id: tableExtId,
      type: "roll-table",
      sourceDocument: {
        type: "RollTable",
        id: table.id,
        uuid: `RollTable.${table.id}`,
      },
      ...(folderExtId ? { folder: folderExtId } : {}),
      randomTable: tableId,
      structure: { foundrySourceData },
    };

    const uuidPart = tableExtId.replace("foundry-roll-table:", "");
    files.push({
      path: `extensions/org.ravens-eye.foundry-vtt/roll-tables/foundry-roll-table-${uuidPart}.yaml`,
      content: toYamlDoc(sidecar),
    });

    // Build the portable Raven's Eye random-table markdown.
    const frontmatter = buildTableFrontmatter(tableId, table.name);
    const formula = table.formula ?? "";
    files.push({
      path: `random-table/${slugify(table.name)}.md`,
      content: `${frontmatter}\n# ${table.name}\n\nFormula: \`${formula}\`\n\n_Foundry roll table backup. See the sidecar YAML for complete reconstruction data._\n`,
    });
  }

  const allFiles: BackupFileEntry[] = [
    { path: "ravens-eye.yaml", content: buildCampaignManifest() },
    ...folderResourceFiles,
    ...files,
  ];

  return { files: allFiles, warnings };
}
