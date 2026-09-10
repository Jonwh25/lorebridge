/**
 * Shared utilities for LoreBridge Foundry module capabilities.
 * Covers journal lookup, AI response parsing, dialog helpers, and misc utils.
 *
 * HTTP helpers live in utils/backend-client.ts.
 * Foundry file I/O lives in utils/foundry-io.ts.
 */

import { getLoreBridgeSettings } from "../settings.js";
import { matchName } from "../utils/name-matching.js";
import { requireFoundryGm } from "./errors.js";

// ---------------------------------------------------------------------------
// Extended Foundry document types (needed for operations not in base types)
// ---------------------------------------------------------------------------

export type JournalWithOps = FoundryJournalEntry & {
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
};

type FoundryFolderDoc = {
  id: string;
  name: string;
  type: string;
  folder?: { id: string } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { escHtml } from "../utils/html.js";

// ---------------------------------------------------------------------------
// Journal folder lookup
// ---------------------------------------------------------------------------

/** Returns all journals inside a top-level Foundry folder by name. */
export function getJournalsInFolder(folderName: string): JournalWithOps[] {
  const folders = (game as unknown as { folders: Iterable<FoundryFolderDoc> }).folders;
  const rootFolderIds = new Set<string>();
  const allFolderIds = new Set<string>();

  // Collect the root folder and all nested subfolder IDs
  const folderList: FoundryFolderDoc[] = [];
  for (const f of folders) {
    if (f.type === "JournalEntry") folderList.push(f);
  }

  for (const f of folderList) {
    if (f.name === folderName && !f.folder) rootFolderIds.add(f.id);
  }

  if (rootFolderIds.size === 0) {
    // If no root (no parent), find any folder with this exact name
    for (const f of folderList) {
      if (f.name === folderName) rootFolderIds.add(f.id);
    }
  }

  const queue = [...rootFolderIds];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    allFolderIds.add(parentId);
    for (const f of folderList) {
      if (f.folder?.id === parentId && !allFolderIds.has(f.id)) {
        queue.push(f.id);
      }
    }
  }

  const result: JournalWithOps[] = [];
  for (const j of game.journal) {
    const jf = (j as unknown as { folder?: { id: string } | null }).folder;
    if (jf && allFolderIds.has(jf.id)) {
      result.push(j as unknown as JournalWithOps);
    }
  }
  return result;
}

/** Finds the Foundry folder ID for a subfolder by name under a parent folder name. */
export function findSubfolderId(parentFolderName: string, subFolderName: string): string | null {
  const folders = (game as unknown as { folders: Iterable<FoundryFolderDoc> }).folders;
  const folderList: FoundryFolderDoc[] = [];
  for (const f of folders) {
    if (f.type === "JournalEntry") folderList.push(f);
  }

  let parentId: string | null = null;
  for (const f of folderList) {
    if (f.name === parentFolderName) { parentId = f.id; break; }
  }
  if (!parentId) return null;

  for (const f of folderList) {
    if (f.name === subFolderName && f.folder?.id === parentId) return f.id;
  }
  return null;
}

/** Finds a journal in a list that best matches the given name. */
export function findMatchingJournal(
  name: string,
  journals: JournalWithOps[],
  threshold = 50,
): JournalWithOps | null {
  const names = journals.map((j) => j.name);
  const matched = matchName(name, names, threshold);
  if (!matched) return null;
  return journals.find((j) => j.name === matched) ?? null;
}

// ---------------------------------------------------------------------------
// AI response parsing
// ---------------------------------------------------------------------------

/** Parses a JSON value from an AI response string, handling markdown fences. */
export function parseJsonFromAi<T>(text: string): T | null {
  let cleaned = text.trim();
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(cleaned);
  if (fenceMatch) cleaned = (fenceMatch[1] ?? "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dialog helpers
// ---------------------------------------------------------------------------

/** Shows a yes/no confirmation dialog. Returns true if the user confirmed. */
export async function confirmDialog(title: string, contentHtml: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = new foundry.applications.api.DialogV2({
      window: { title, resizable: true },
      position: { width: 480, height: "auto" },
      content: `<div style="padding:0.5rem">${contentHtml}</div>`,
      buttons: [
        {
          action: "confirm",
          label: "Confirm",
          icon: "fas fa-check",
          default: true,
          callback: () => { resolve(true); },
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fas fa-times",
          callback: () => { resolve(false); },
        },
      ],
    });
    void dialog.render({ force: true });
    const dialogWithId = dialog as unknown as { id: string };
    // If dialog is closed via X button, resolve false
    const onClose = (app: unknown) => {
      if ((app as { id?: string }).id === dialogWithId.id) {
        resolve(false);
        Hooks.off("closeApplication", onClose);
      }
    };
    Hooks.on("closeApplication", onClose);
  });
}

/** Shows a result summary dialog. */
export function showResultDialog(title: string, contentHtml: string, width = 560): void {
  new foundry.applications.api.DialogV2({
    window: { title, resizable: true },
    position: { width, height: "auto" },
    content: `<div style="padding:0.5rem;font-size:0.9em;max-height:500px;overflow-y:auto">${contentHtml}</div>`,
    buttons: [{ action: "close", label: "Close", icon: "fas fa-times", default: true }],
  }).render({ force: true });
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function requireGm(fn: string): void {
  requireFoundryGm(fn);
}

/** Returns the latest session number from session log pages, or 0. */
export function latestSessionNumber(): number {
  const settings = getLoreBridgeSettings();
  const folderName = settings.sessionLogFolder || "Session Logs";
  const journal = Array.from(game.journal).find((j) => j.name === folderName);
  if (!journal) return 0;
  let max = 0;
  const re = /\bsession\s+#?(\d+)\b/i;
  for (const page of journal.pages) {
    const m = re.exec(page.name);
    if (m) {
      const n = parseInt(m[1] ?? "", 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}
