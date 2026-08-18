/**
 * Quest Status Tracker — issue #272
 *
 * Tracks quest status changes from session logs and syncs to Campaign Codex
 * quest journals. Writes results to {lorefolderPath}/quest_status_summary.json.
 */

import { getLoreBridgeSettings } from "../settings.js";
import {
  readAll as sessionReadAll,
  readLatest as sessionReadLatest,
  extractFromSession,
  type SessionLogPage,
} from "./session-log-pipeline.js";
import {
  readLoreJson,
  writeLoreJson,
  getJournalsInFolder,
  findMatchingJournal,
  findSubfolderId,
  parseJsonFromAi,
  confirmDialog,
  showResultDialog,
  escHtml,
  type JournalWithOps,
} from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestStatus = "available" | "in-progress" | "completed" | "failed";

export type QuestStatusEntry = {
  name: string;
  status: QuestStatus;
  session: number;
  folder: string;
};

type AiQuestResult = {
  name: string;
  status: string;
  evidence?: string;
};

const FILENAME = "quest_status_summary.json";
const CC_FOLDER = "Campaign Codex - Quests";

// Campaign Codex flag values per status
const STATUS_FLAGS: Record<QuestStatus, { completed: boolean; failed: boolean; inactive: boolean; boardColumn: string; folder: string }> = {
  available:    { completed: false, failed: false, inactive: true,  boardColumn: "backlog",    folder: "Available" },
  "in-progress":{ completed: false, failed: false, inactive: false, boardColumn: "active",     folder: "In Progress" },
  completed:    { completed: true,  failed: false, inactive: false, boardColumn: "completed",  folder: "Completed" },
  failed:       { completed: false, failed: true,  inactive: false, boardColumn: "completed",  folder: "Failed" },
};

const EXTRACT_PROMPT =
  `Identify quest or mission status changes in this session log. Look for quests being completed, failed, actively worked on, or newly mentioned.
Return ONLY a JSON array of objects. Format:
[{"name":"Quest Name","status":"completed","evidence":"Brief evidence quote or description."}]
Valid status values: available (newly introduced), in-progress (actively working on), completed (finished), failed (failed or abandoned).
If no quest changes found, return [].`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeQuestStatus(raw: string): QuestStatus {
  const s = raw.toLowerCase().trim();
  if (s === "completed" || s === "complete") return "completed";
  if (s === "failed" || s === "fail" || s === "abandoned") return "failed";
  if (s === "in-progress" || s === "in progress" || s === "active" || s === "started") return "in-progress";
  return "available";
}

async function extractQuestsFromPage(page: SessionLogPage): Promise<AiQuestResult[]> {
  try {
    const raw = await extractFromSession(page.content, EXTRACT_PROMPT, page.pageId);
    const parsed = parseJsonFromAi<AiQuestResult[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x.name === "string" && typeof x.status === "string");
  } catch {
    return [];
  }
}

async function syncQuestJournal(
  journal: JournalWithOps,
  entry: QuestStatusEntry,
): Promise<void> {
  const flags = STATUS_FLAGS[entry.status];

  // Update Campaign Codex flags
  const ccData = (journal.getFlag("campaign-codex", "data") as Record<string, unknown> | undefined) ?? {};
  const existingQuests = (ccData["quests"] as unknown[]) ?? [{}];
  const q0 = (existingQuests[0] as Record<string, unknown>) ?? {};
  const updatedQuest = {
    ...q0,
    completed: flags.completed,
    failed: flags.failed,
    inactive: flags.inactive,
    boardColumn: flags.boardColumn,
  };
  await journal.setFlag("campaign-codex", "data", {
    ...ccData,
    quests: [updatedQuest, ...existingQuests.slice(1)],
  });

  // Move journal to the correct subfolder
  const subFolderId = findSubfolderId(CC_FOLDER, flags.folder);
  if (subFolderId) {
    await journal.update({ folder: subFolderId });
  } else {
    console.warn(`LoreBridge Quest Status: Could not find subfolder "${flags.folder}" under "${CC_FOLDER}"`);
  }
}

async function applyQuestResults(
  entries: Array<{ name: string; status: QuestStatus; session: number; evidence?: string }>,
  lorefolderPath: string,
): Promise<{ written: number; journalsUpdated: number; journalsMissing: string[] }> {
  const existing = (await readLoreJson<QuestStatusEntry[]>(lorefolderPath, FILENAME)) ?? [];
  const merged = [...existing];

  for (const entry of entries) {
    const flags = STATUS_FLAGS[entry.status];
    const idx = merged.findIndex((e) => e.name.toLowerCase() === entry.name.toLowerCase());
    const newEntry: QuestStatusEntry = {
      name: entry.name,
      status: entry.status,
      session: entry.session,
      folder: flags.folder,
    };
    if (idx >= 0) {
      merged[idx] = newEntry;
    } else {
      merged.push(newEntry);
    }
  }

  await writeLoreJson(lorefolderPath, FILENAME, merged);

  const allCcJournals = getJournalsInFolder(CC_FOLDER);
  let journalsUpdated = 0;
  const journalsMissing: string[] = [];

  for (const entry of entries) {
    const journal = findMatchingJournal(entry.name, allCcJournals);
    if (journal) {
      await syncQuestJournal(journal, {
        name: entry.name,
        status: entry.status,
        session: entry.session,
        folder: STATUS_FLAGS[entry.status].folder,
      });
      journalsUpdated++;
    } else {
      journalsMissing.push(entry.name);
    }
  }

  if (journalsMissing.length > 0) {
    console.info(
      `LoreBridge Quest Status: No matching journal for: ${journalsMissing.join(", ")}`,
    );
  }

  return { written: entries.length, journalsUpdated, journalsMissing };
}

// ---------------------------------------------------------------------------
// Preview dialog
// ---------------------------------------------------------------------------

async function showQuestPreview(
  changes: Array<{ name: string; status: QuestStatus; session: number; evidence?: string }>,
  sessionLabel: string,
): Promise<Array<{ name: string; status: QuestStatus; session: number; evidence?: string }> | null> {
  const STATUS_COLORS: Record<QuestStatus, string> = {
    available: "#7ab5e8",
    "in-progress": "#f0c040",
    completed: "#5dbb63",
    failed: "#c88",
  };

  const rowsHtml = changes
    .map(
      (c) =>
        `<tr>
          <td style="padding:3px 6px;font-weight:bold">${escHtml(c.name)}</td>
          <td style="padding:3px 6px;color:${STATUS_COLORS[c.status]}">${escHtml(c.status)}</td>
          <td style="padding:3px 6px;font-size:0.8em;color:#aaa">${escHtml(c.evidence ?? "")}</td>
        </tr>`,
    )
    .join("");

  const confirmed = await confirmDialog(
    `Quest Status — ${sessionLabel}`,
    `<p>Detected <strong>${changes.length}</strong> quest status change(s):</p>
     <table style="width:100%;border-collapse:collapse;font-size:0.85em;max-height:300px;overflow-y:auto">
       <thead><tr style="color:#888;text-align:left">
         <th style="padding:3px 6px">Quest</th>
         <th style="padding:3px 6px">Status</th>
         <th style="padding:3px 6px">Evidence</th>
       </tr></thead>
       <tbody>${rowsHtml}</tbody>
     </table>`,
  );

  return confirmed ? changes : null;
}

// ---------------------------------------------------------------------------
// Public UI entry points
// ---------------------------------------------------------------------------

/** Initialize: process ALL session log pages. */
export async function initializeQuestStatusTracker(): Promise<void> {
  if (!game.user?.isGM) return;

  const pages = sessionReadAll();
  if (pages.length === 0) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  const confirmed = await confirmDialog(
    "Quest Status Tracker — Initialize",
    `<p>This will process <strong>${pages.length}</strong> session log page(s) using AI to identify quest status changes.</p>
     <p style="color:#aaa;font-size:0.85em">Detected changes will be shown for review before being applied.</p>`,
  );
  if (!confirmed) return;

  ui.notifications.info("LoreBridge Quest Status: Processing sessions…");

  const allChanges: Map<string, { name: string; status: QuestStatus; session: number; evidence?: string }> = new Map();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const results = await extractQuestsFromPage(page);
    for (const r of results) {
      const key = r.name.toLowerCase();
      const status = normalizeQuestStatus(r.status);
      allChanges.set(key, {
        name: r.name,
        status,
        session: page.sessionNumber,
        ...(r.evidence !== undefined ? { evidence: r.evidence } : {}),
      });
    }
    if ((i + 1) % 5 === 0 || i === pages.length - 1) {
      ui.notifications.info(
        `LoreBridge Quest Status: processed ${i + 1} of ${pages.length} sessions…`,
      );
    }
  }

  if (allChanges.size === 0) {
    ui.notifications.info("LoreBridge Quest Status: No quest changes detected.");
    return;
  }

  const changeList = [...allChanges.values()];
  const approved = await showQuestPreview(changeList, `All ${pages.length} sessions`);
  if (!approved) return;

  const settings = getLoreBridgeSettings();
  const { written, journalsUpdated, journalsMissing } = await applyQuestResults(
    approved,
    settings.lorefolderPath,
  );

  const missingHtml =
    journalsMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${journalsMissing.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "Quest Status — Complete",
    `<p>✅ Wrote <strong>${written}</strong> quest status entries.</p>
     <p>📖 Updated <strong>${journalsUpdated}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

/** Current: process only the latest session log page. */
export async function updateQuestStatusFromLatest(): Promise<void> {
  if (!game.user?.isGM) return;

  const page = sessionReadLatest();
  if (!page) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  ui.notifications.info(`LoreBridge Quest Status: Analyzing session ${page.sessionNumber}…`);

  const results = await extractQuestsFromPage(page);
  if (results.length === 0) {
    ui.notifications.info("LoreBridge Quest Status: No quest changes detected in the latest session.");
    return;
  }

  const changes = results.map((r) => ({
    name: r.name,
    status: normalizeQuestStatus(r.status),
    session: page.sessionNumber,
    ...(r.evidence !== undefined ? { evidence: r.evidence } : {}),
  }));

  const approved = await showQuestPreview(changes, `Session ${page.sessionNumber}`);
  if (!approved) return;

  const settings = getLoreBridgeSettings();
  const { written, journalsUpdated, journalsMissing } = await applyQuestResults(
    approved,
    settings.lorefolderPath,
  );

  const missingHtml =
    journalsMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${journalsMissing.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "Quest Status — Complete",
    `<p>✅ Updated <strong>${written}</strong> quest status entries from session ${page.sessionNumber}.</p>
     <p>📖 Synced <strong>${journalsUpdated}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

