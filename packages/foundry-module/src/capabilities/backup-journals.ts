/**
 * Journal folder backup — serializes Foundry JournalEntry documents from a
 * named folder (and all subfolders) into:
 *   - Raven's Eye portable markdown files (text pages, human-readable)
 *   - Foundry fidelity sidecar YAML files (full toObject() data for restore)
 *
 * Stable IDs are generated once per document and stored in Foundry flags so
 * they persist across subsequent exports.
 */

import { RAVENS_EYE_SPEC_VERSION } from "@lorebridge/shared";
import type { BackupFileEntry } from "@lorebridge/shared/capabilities";
import { toYamlDoc } from "./backup-yaml.js";
import { buildFolderMap, collectSubtreeIds, findRootFolder, type FoundryFolder } from "./backup-folders.js";

const MODULE_ID = "lorebridge";
const FLAG_RAVENS_EYE_ID = "ravensEyeId";
const FLAG_JOURNAL_EXT_ID = "journalExtId";

// ---------------------------------------------------------------------------
// Extended Foundry types
// ---------------------------------------------------------------------------

type JournalWithFlags = FoundryJournalEntry & {
  folder?: { id: string; name: string } | null;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  toObject(): Record<string, unknown>;
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

function plainText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    return (
      new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
    );
  }
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFrontmatter(id: string, name: string): string {
  const meta: Record<string, unknown> = {
    specification: RAVENS_EYE_SPEC_VERSION,
    id,
    name,
    type: "entry",
    audience: "facilitator",
  };
  const yamlBody = toYamlDoc(meta);
  return `---\n# ravens-eye-metadata\n${yamlBody}---\n`;
}

function buildCampaignManifest(): string {
  const worldId = game.world?.id ?? "unknown";
  const worldTitle = game.world?.title ?? "Unknown Campaign";
  const systemId = game.system?.id ?? "unknown";

  const idHash = Array.from(worldId + "-campaign")
    .reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
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

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Exports all JournalEntry documents from the named folder (and all
 * subfolders) to:
 *   - Raven's Eye markdown files (portable text content)
 *   - Foundry sidecar YAML files (complete toObject() data for full restore)
 *
 * Called from the `/lb backup journals <folderName>` chat command.
 */
export async function exportJournalFolder(
  folderName: string,
): Promise<{ files: BackupFileEntry[]; warnings: string[] }> {
  if (!game.journal) {
    throw new Error("The Foundry journal collection is unavailable.");
  }

  const warnings: string[] = [];
  const files: BackupFileEntry[] = [];

  // Build folder map and find root.
  const allJournals = Array.from(game.journal);
  const folderById = buildFolderMap(
    allJournals.map((j) => (j as unknown as JournalWithFlags).folder ?? null),
  );
  const rootFolder = findRootFolder(folderName, folderById, "JournalEntry");

  if (!rootFolder) {
    throw new Error(
      `No folder named "${folderName}" found in Journal Entries. Check the folder name and try again.`,
    );
  }

  const targetFolderIds = collectSubtreeIds(rootFolder.id, folderById);

  const journals = allJournals.filter((j) => {
    const folder = (j as unknown as JournalWithFlags).folder;
    return folder?.id && targetFolderIds.has(folder.id);
  });

  if (journals.length === 0) {
    throw new Error(
      `No journal entries found in folder "${folderName}" or its subfolders. Check the folder name and try again.`,
    );
  }

  // Serialize each journal entry.
  for (const journal of journals) {
    const jExt = journal as unknown as JournalWithFlags;

    // Get or generate a stable Raven's Eye entry ID.
    let ravensEyeId = jExt.getFlag(MODULE_ID, FLAG_RAVENS_EYE_ID) as string | undefined;
    if (!ravensEyeId || !ravensEyeId.startsWith("entry:")) {
      ravensEyeId = `entry:${crypto.randomUUID()}`;
      try {
        await jExt.setFlag(MODULE_ID, FLAG_RAVENS_EYE_ID, ravensEyeId);
      } catch {
        warnings.push(
          `Could not persist stable ID for journal "${journal.name}" — it will change on the next export.`,
        );
      }
    }

    // Get or generate a stable Foundry extension ID for the sidecar.
    let journalExtId = jExt.getFlag(MODULE_ID, FLAG_JOURNAL_EXT_ID) as string | undefined;
    if (!journalExtId || !journalExtId.startsWith("foundry-journal:")) {
      journalExtId = `foundry-journal:${crypto.randomUUID()}`;
      try {
        await jExt.setFlag(MODULE_ID, FLAG_JOURNAL_EXT_ID, journalExtId);
      } catch {
        warnings.push(
          `Could not persist sidecar ID for journal "${journal.name}" — it will change on the next export.`,
        );
      }
    }

    // --- Raven's Eye portable markdown (text pages only) ---
    const pages = Array.from(journal.pages);
    const textContent: string[] = [];

    for (const page of pages.sort((a, b) => a.sort - b.sort)) {
      if (page.type !== "text") {
        // Non-text pages are fully captured in the sidecar; just note assets.
        const imgSrc = (page as unknown as { src?: string }).src;
        if (imgSrc) {
          warnings.push(`Asset inventoried (not exported): ${imgSrc} (journal "${journal.name}", page "${page.name}")`);
        }
        continue;
      }
      const html = page.text?.content ?? "";
      const text = plainText(html).trim();
      if (page.name) {
        textContent.push(`## ${page.name}\n\n${text}`);
      } else {
        textContent.push(text);
      }
    }

    if (textContent.length === 0) {
      warnings.push(`Journal "${journal.name}" has no text pages — only the sidecar YAML was written.`);
    }

    const frontmatter = buildFrontmatter(ravensEyeId, journal.name);
    const body = textContent.join("\n\n");
    files.push({ path: `entry/${slugify(journal.name)}.md`, content: `${frontmatter}\n${body}\n` });

    // --- Foundry sidecar YAML (complete toObject() data for full restore) ---
    const rawData = jExt.toObject();
    const { _id: _stripId, _stats: _stripStats, ...foundrySourceData } = rawData as Record<string, unknown>;

    const sidecar: Record<string, unknown> = {
      id: journalExtId,
      type: "journal",
      sourceDocument: {
        type: "JournalEntry",
        id: journal.id,
        uuid: `JournalEntry.${journal.id}`,
      },
      place: ravensEyeId,
      structure: { foundrySourceData },
    };

    const sidecarPath = `extensions/org.ravens-eye.foundry-vtt/journals/foundry-journal-${journalExtId.replace("foundry-journal:", "")}.yaml`;
    files.push({ path: sidecarPath, content: toYamlDoc(sidecar) });
  }

  files.unshift({ path: "ravens-eye.yaml", content: buildCampaignManifest() });

  return { files, warnings };
}
