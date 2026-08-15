/**
 * Portrait Auto-Match — issue #276
 *
 * Recursively scans a configurable portrait root folder (Data-relative),
 * fuzzy-matches image filenames to NPC journal names via Campaign Codex,
 * and sets flags["campaign-codex"].image for each confirmed match.
 */

import { getLoreBridgeSettings } from "../settings.js";
import { matchName } from "../utils/name-matching.js";
import {
  getJournalsInFolder,
  confirmDialog,
  showResultDialog,
  escHtml,
  type JournalWithOps,
} from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PortraitMatch = {
  journalId: string;
  journalName: string;
  imagePath: string;
  imageFilename: string;
  currentImage: string | null;
  willOverwrite: boolean;
};

type FilePickerResult = {
  files: string[];
  dirs: string[];
  target: string;
};

const CC_NPC_FOLDER = "Campaign Codex - NPCs";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]);

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

async function listImagesRecursive(
  folderPath: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 6) return [];
  try {
    const fp = foundry.applications.apps.FilePicker.implementation;
    const result = (await fp.browse("data", folderPath)) as FilePickerResult;
    const images: string[] = result.files.filter((f) => {
      const lower = f.toLowerCase();
      return [...IMAGE_EXTENSIONS].some((ext) => lower.endsWith(ext));
    });
    for (const dir of result.dirs) {
      const sub = await listImagesRecursive(dir, depth + 1);
      images.push(...sub);
    }
    return images;
  } catch {
    return [];
  }
}

function filenameWithoutExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dotIdx = base.lastIndexOf(".");
  return dotIdx >= 0 ? base.slice(0, dotIdx) : base;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function buildMatches(
  journals: JournalWithOps[],
  imagePaths: string[],
  threshold: number,
): PortraitMatch[] {
  const imagesByName = new Map<string, string>();
  for (const path of imagePaths) {
    const name = filenameWithoutExt(path);
    if (name) imagesByName.set(name, path);
  }

  const imageNames = [...imagesByName.keys()];
  const matches: PortraitMatch[] = [];

  for (const journal of journals) {
    const matched = matchName(journal.name, imageNames, threshold);
    if (!matched) continue;
    const imagePath = imagesByName.get(matched);
    if (!imagePath) continue;

    const ccData = journal.getFlag("campaign-codex", "data") as Record<string, unknown> | undefined;
    const currentImage = (ccData?.["image"] as string | undefined) ?? null;

    matches.push({
      journalId: journal.id,
      journalName: journal.name,
      imagePath,
      imageFilename: matched,
      currentImage,
      willOverwrite: !!currentImage,
    });
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Preview dialog
// ---------------------------------------------------------------------------

async function showMatchPreview(matches: PortraitMatch[]): Promise<PortraitMatch[] | null> {
  const newMatches = matches.filter((m) => !m.willOverwrite);
  const overwriteMatches = matches.filter((m) => m.willOverwrite);

  const rowsHtml = (list: PortraitMatch[], overwrite: boolean) =>
    list
      .map(
        (m) =>
          `<tr>
            <td style="padding:2px 6px;font-weight:bold">${escHtml(m.journalName)}</td>
            <td style="padding:2px 6px;font-size:0.8em;color:${overwrite ? "#c88" : "#5dbb63"}">${escHtml(m.imageFilename)}</td>
          </tr>`,
      )
      .join("");

  const overwriteSection =
    overwriteMatches.length > 0
      ? `<p style="margin-top:0.75rem;color:#c88;font-weight:bold">⚠️ ${overwriteMatches.length} will overwrite existing portrait:</p>
         <table style="width:100%;border-collapse:collapse;font-size:0.85em">${rowsHtml(overwriteMatches, true)}</table>`
      : "";

  const confirmed = await confirmDialog(
    "Portrait Auto-Match",
    `<p>Found <strong>${matches.length}</strong> portrait match(es):</p>
     <table style="width:100%;border-collapse:collapse;font-size:0.85em;max-height:250px;overflow-y:auto">
       <thead><tr style="color:#888;text-align:left">
         <th style="padding:2px 6px">NPC Journal</th>
         <th style="padding:2px 6px">Portrait File</th>
       </tr></thead>
       <tbody>${rowsHtml(newMatches, false)}</tbody>
     </table>
     ${overwriteSection}`,
  );

  return confirmed ? matches : null;
}

// ---------------------------------------------------------------------------
// Applying matches
// ---------------------------------------------------------------------------

async function applyMatches(
  matches: PortraitMatch[],
  journals: JournalWithOps[],
): Promise<{ applied: number; failed: string[] }> {
  const journalById = new Map(journals.map((j) => [j.id, j]));
  let applied = 0;
  const failed: string[] = [];

  for (const match of matches) {
    const journal = journalById.get(match.journalId);
    if (!journal) continue;
    try {
      const ccData = (journal.getFlag("campaign-codex", "data") as Record<string, unknown> | undefined) ?? {};
      await journal.setFlag("campaign-codex", "data", {
        ...ccData,
        image: match.imagePath,
      });
      applied++;
    } catch (err) {
      console.error(`LoreBridge Portrait Match: failed to update "${match.journalName}":`, err);
      failed.push(match.journalName);
    }
  }

  return { applied, failed };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function matchPortraits(): Promise<void> {
  if (!game.user?.isGM) return;

  const settings = getLoreBridgeSettings();
  const portraitRoot = settings.portraitMatchRoot || "Artwork/Portraits/NPCs";
  const threshold = 50;

  ui.notifications.info(`LoreBridge Portrait Match: Scanning ${portraitRoot}…`);

  const imagePaths = await listImagesRecursive(portraitRoot);
  if (imagePaths.length === 0) {
    ui.notifications.warn(
      `LoreBridge: No portrait images found in "${portraitRoot}". Check Settings → Portrait Match Root.`,
    );
    return;
  }

  const journals = getJournalsInFolder(CC_NPC_FOLDER);
  if (journals.length === 0) {
    ui.notifications.warn(
      `LoreBridge: No journals found in "${CC_NPC_FOLDER}". Make sure Campaign Codex is set up.`,
    );
    return;
  }

  const matches = buildMatches(journals, imagePaths, threshold);
  if (matches.length === 0) {
    ui.notifications.info(
      `LoreBridge Portrait Match: No matches found among ${imagePaths.length} image(s) and ${journals.length} NPC journal(s).`,
    );
    return;
  }

  const approved = await showMatchPreview(matches);
  if (!approved) return;

  const { applied, failed } = await applyMatches(approved, journals);

  const failedHtml =
    failed.length > 0
      ? `<p style="color:#c88;font-size:0.85em">Failed to update: ${failed.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "Portrait Match — Complete",
    `<p>✅ Applied portraits to <strong>${applied}</strong> NPC journal(s).</p>
     <p style="color:#aaa;font-size:0.85em">Scanned ${imagePaths.length} image(s) across ${journals.length} NPC journal(s).</p>
     ${failedHtml}`,
  );
}
