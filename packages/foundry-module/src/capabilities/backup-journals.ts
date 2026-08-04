/**
 * Journal folder backup — serializes Foundry JournalEntry documents from a
 * named folder into Raven's Eye portable markdown files.
 *
 * Stable IDs are generated once per document and stored in Foundry flags so
 * they persist across subsequent exports.
 */

import { RAVENS_EYE_SPEC_VERSION } from "@lorebridge/shared";
import type { BackupFileEntry } from "@lorebridge/shared/capabilities";
import { toYamlDoc } from "./backup-yaml.js";

const MODULE_ID = "lorebridge";
const FLAG_RAVENS_EYE_ID = "ravensEyeId";

// ---------------------------------------------------------------------------
// Extended Foundry types (not in foundry-globals.d.ts)
// ---------------------------------------------------------------------------

type JournalWithFlags = FoundryJournalEntry & {
  folder?: { id: string; name: string } | null;
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

  // Use a deterministic UUID derived from the world ID by hashing. Since we
  // cannot use crypto.subtle synchronously here, we use a simple scramble of
  // the world ID to keep it stable within the same world across exports.
  // This is not a real UUIDv4 but satisfies the CAMPAIGN_ID_RE pattern.
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
 * Exports all JournalEntry documents from the named folder to Raven's Eye
 * markdown files. Returns the list of files to commit and any warnings.
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

  // Collect journals in the named folder.
  const journals = Array.from(game.journal).filter((j) => {
    const jExt = j as unknown as JournalWithFlags;
    return jExt.folder?.name === folderName;
  });

  if (journals.length === 0) {
    throw new Error(
      `No journal entries found in folder "${folderName}". Check the folder name and try again.`,
    );
  }

  // Serialize each journal entry.
  for (const journal of journals) {
    const jExt = journal as unknown as JournalWithFlags;

    // Get or generate a stable Raven's Eye ID.
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

    // Serialize pages.
    const pages = Array.from(journal.pages);
    const textContent: string[] = [];

    for (const page of pages.sort((a, b) => a.sort - b.sort)) {
      if (page.type !== "text") {
        warnings.push(
          `Journal "${journal.name}" page "${page.name}" has type "${page.type}" — only text pages are exported.`,
        );
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
      warnings.push(`Journal "${journal.name}" has no exportable text pages.`);
    }

    const frontmatter = buildFrontmatter(ravensEyeId, journal.name);
    const body = textContent.join("\n\n");
    const markdownContent = `${frontmatter}\n${body}\n`;

    const filePath = `entry/${slugify(journal.name)}.md`;
    files.push({ path: filePath, content: markdownContent });
  }

  // Always include / update the campaign manifest.
  files.unshift({ path: "ravens-eye.yaml", content: buildCampaignManifest() });

  return { files, warnings };
}
