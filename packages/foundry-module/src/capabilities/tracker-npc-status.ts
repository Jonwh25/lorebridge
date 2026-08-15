/**
 * NPC Status Tracker — issue #270
 *
 * Reads session logs via extractFromSession() to identify NPC alive/dead/ghost/undead
 * status across the full campaign. Writes results to {lorefolderPath}/npc_status.json
 * and syncs the matching Campaign Codex NPC dossier status field.
 */

import { getLoreBridgeSettings } from "../settings.js";
import {
  readAll as sessionReadAll,
  readLatest as sessionReadLatest,
  extractFromSession,
  type SessionLogPage,
} from "./session-log-reader.js";
import type { NpcDossierData } from "./campaign-codex-widget.js";
import { makeDefaultDossierData } from "./campaign-codex-widget.js";
import {
  readLoreJson,
  writeLoreJson,
  backupLoreFile,
  getJournalsInFolder,
  findMatchingJournal,
  parseJsonFromAi,
  confirmDialog,
  showResultDialog,
  escHtml,
  latestSessionNumber,
  type JournalWithOps,
} from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NpcStatus =
  | "Alive"
  | "Dead"
  | "Ghost (Active)"
  | "Ghost (At Rest)"
  | "Undead (Active)"
  | "Undead (Destroyed)"
  | "Unknown";

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "Alive", "Dead", "Ghost (Active)", "Ghost (At Rest)",
  "Undead (Active)", "Undead (Destroyed)", "Unknown",
]);

export type NpcStatusEntry = {
  name: string;
  status: NpcStatus;
  session: number;
  killedBy?: string;
  note?: string;
};

type AiNpcStatusResult = {
  name: string;
  status: string;
  killedBy?: string;
  note?: string;
};

type AmbiguousEntry = {
  name: string;
  excerpt: string;
  suggestedStatus: NpcStatus;
  session: number;
  killedBy?: string;
  note?: string;
};

const FILENAME = "npc_status.json";
const CC_FOLDER = "Campaign Codex - NPCs";

const EXTRACT_PROMPT =
  `Extract NPC status changes from this session log. Return ONLY a JSON array of objects for NPCs whose status changed or is clearly established as dead/undead/ghost. Format:
[{"name":"NPC Name","status":"Dead","killedBy":"Killer Name","note":"One sentence about their fate."}]
Valid status values: Alive, Dead, Ghost (Active), Ghost (At Rest), Undead (Active), Undead (Destroyed), Unknown.
Omit killedBy if not applicable. Only include NPCs with significant status changes — not every living NPC mentioned. If no changes, return [].`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeStatus(raw: string): NpcStatus {
  const s = String(raw ?? "").trim();
  if (VALID_STATUSES.has(s)) return s as NpcStatus;
  if (/dead|kill|slain|deceased/i.test(s)) return "Dead";
  if (/ghost.*rest|at rest/i.test(s)) return "Ghost (At Rest)";
  if (/ghost/i.test(s)) return "Ghost (Active)";
  if (/undead.*destroy|destroyed/i.test(s)) return "Undead (Destroyed)";
  if (/undead/i.test(s)) return "Undead (Active)";
  return "Unknown";
}

function isTerminal(status: NpcStatus): boolean {
  return ["Dead", "Ghost (At Rest)", "Undead (Destroyed)"].includes(status);
}

async function extractStatusFromPage(page: SessionLogPage): Promise<AiNpcStatusResult[]> {
  try {
    const raw = await extractFromSession(page.content, EXTRACT_PROMPT, page.pageId);
    const parsed = parseJsonFromAi<AiNpcStatusResult[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x.name === "string" && typeof x.status === "string");
  } catch {
    return [];
  }
}

function syncDossierStatus(
  journal: JournalWithOps,
  entry: NpcStatusEntry,
): Promise<void> {
  const raw = journal.getFlag("lorebridge", "npcDossier");
  const dossier: NpcDossierData =
    raw && typeof raw === "object"
      ? { ...makeDefaultDossierData(), ...(raw as Partial<NpcDossierData>) }
      : makeDefaultDossierData();

  dossier.reference = {
    ...dossier.reference,
    status: entry.status,
    ...(entry.killedBy !== undefined ? { killedBy: entry.killedBy } : {}),
    ...(entry.session ? { killedInSession: entry.session } : {}),
  };

  return journal.setFlag("lorebridge", "npcDossier", dossier);
}

// ---------------------------------------------------------------------------
// Ambiguous review dialog
// ---------------------------------------------------------------------------

async function showAmbiguousReview(ambiguous: AmbiguousEntry[]): Promise<AmbiguousEntry[]> {
  if (ambiguous.length === 0) return [];

  const STATUSES: NpcStatus[] = [
    "Alive", "Dead", "Ghost (Active)", "Ghost (At Rest)",
    "Undead (Active)", "Undead (Destroyed)", "Unknown",
  ];

  const rowsHtml = ambiguous
    .map(
      (a, i) => `
      <tr style="border-bottom:1px solid #333">
        <td style="padding:4px 6px;font-weight:bold">${escHtml(a.name)}</td>
        <td style="padding:4px 6px;font-size:0.85em;color:#aaa;max-width:200px;word-wrap:break-word">${escHtml(a.excerpt.slice(0, 100))}…</td>
        <td style="padding:4px 6px">
          <select name="status_${i}" style="background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;padding:2px 4px">
            ${STATUSES.map((s) => `<option value="${escHtml(s)}" ${s === a.suggestedStatus ? "selected" : ""}>${escHtml(s)}</option>`).join("")}
          </select>
        </td>
      </tr>`,
    )
    .join("");

  const contentHtml = `
    <div style="max-height:420px;overflow-y:auto">
      <p style="margin:0 0 8px;color:#aaa;font-size:0.85em">${ambiguous.length} NPC status change(s) need confirmation.</p>
      <div style="margin-bottom:8px">
        <button type="button" id="lb-mark-all-alive" style="font-size:0.8em;padding:2px 8px">Mark all Alive</button>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.85em">
        <thead>
          <tr style="color:#888;text-align:left">
            <th style="padding:4px 6px">NPC</th>
            <th style="padding:4px 6px">Evidence</th>
            <th style="padding:4px 6px">Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  return new Promise((resolve) => {
    // Wire up the "Mark all Alive" bulk button after the dialog renders.
    let renderHookId: number | null = null;
    renderHookId = Hooks.on("renderApplication", (...args: unknown[]) => {
      const html = args[1] as HTMLElement | null;
      if (!html) return;
      const btn = html.querySelector<HTMLButtonElement>("#lb-mark-all-alive");
      if (!btn) return;
      if (renderHookId !== null) { Hooks.off("renderApplication", renderHookId); renderHookId = null; }
      btn.addEventListener("click", () => {
        html.querySelectorAll<HTMLSelectElement>("select[name^='status_']").forEach((sel) => {
          sel.value = "Alive";
        });
      });
    });

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: "NPC Status — Review Ambiguous Entries", resizable: true },
      position: { width: 620, height: "auto" },
      content: `<div style="padding:0.5rem">${contentHtml}</div>`,
      buttons: [
        {
          action: "confirm",
          label: "Apply",
          icon: "fas fa-check",
          default: true,
          callback: (_event: Event, button: HTMLElement, dialogUnknown: unknown) => {
            const dialogEl = dialogUnknown as HTMLElement | null;
            const results = ambiguous.map((a, i) => {
              const sel = (dialogEl ?? button.closest("[data-appid]") ?? document).querySelector<HTMLSelectElement>(`select[name="status_${i}"]`);
              const status = sel ? normalizeStatus(sel.value) : a.suggestedStatus;
              return { ...a, suggestedStatus: status };
            });
            resolve(results);
          },
        },
        {
          action: "cancel",
          label: "Skip All",
          icon: "fas fa-forward",
          callback: () => { resolve([]); },
        },
      ],
    });
    void dialog.render({ force: true });
    const dialogWithId = dialog as unknown as { id: string };
    const onClose = (app: unknown) => {
      if ((app as { id?: string }).id === dialogWithId.id) {
        if (renderHookId !== null) { Hooks.off("renderApplication", renderHookId); renderHookId = null; }
        resolve([]);
        Hooks.off("closeApplication", onClose);
      }
    };
    Hooks.on("closeApplication", onClose);
  });
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

async function processPages(
  pages: SessionLogPage[],
): Promise<{ definite: NpcStatusEntry[]; ambiguous: AmbiguousEntry[] }> {
  const definite: NpcStatusEntry[] = [];
  const ambiguous: AmbiguousEntry[] = [];
  const seen = new Set<string>(); // track highest-priority status per NPC name (normalized)

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const results = await extractStatusFromPage(page);
    for (const r of results) {
      const name = r.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const status = normalizeStatus(r.status);

      // If AI returned Unknown, queue for human review
      if (status === "Unknown") {
        ambiguous.push({
          name,
          excerpt: page.content.slice(0, 120),
          suggestedStatus: "Alive",
          session: page.sessionNumber,
          ...(r.killedBy !== undefined ? { killedBy: r.killedBy } : {}),
          ...(r.note !== undefined ? { note: r.note } : {}),
        });
        continue;
      }

      // If a terminal status is already known, don't revert it
      const existing = definite.find((e) => e.name.toLowerCase() === key);
      if (existing) {
        if (isTerminal(existing.status)) continue;
        existing.status = status;
        existing.session = page.sessionNumber;
        if (r.killedBy) existing.killedBy = r.killedBy;
        if (r.note) existing.note = r.note;
      } else if (!seen.has(key)) {
        seen.add(key);
        definite.push({
          name,
          status,
          session: page.sessionNumber,
          ...(r.killedBy ? { killedBy: r.killedBy } : {}),
          ...(r.note ? { note: r.note } : {}),
        });
      }
    }

    if ((i + 1) % 5 === 0 || i === pages.length - 1) {
      ui.notifications.info(
        `LoreBridge NPC Status: processed ${i + 1} of ${pages.length} sessions…`,
      );
    }
  }

  return { definite, ambiguous };
}

async function applyResults(
  entries: NpcStatusEntry[],
  lorefolderPath: string,
): Promise<{ written: number; journalsUpdated: number; journalsMissing: string[] }> {
  // Read existing file and merge (don't overwrite entries not in this batch)
  const existing = (await readLoreJson<NpcStatusEntry[]>(lorefolderPath, FILENAME)) ?? [];
  const merged = [...existing];

  for (const entry of entries) {
    const idx = merged.findIndex((e) => e.name.toLowerCase() === entry.name.toLowerCase());
    if (idx >= 0) {
      // Update existing entry if new status is terminal or current isn't terminal
      const cur = merged[idx]!;
      if (!isTerminal(cur.status) || isTerminal(entry.status)) {
        merged[idx] = entry;
      }
    } else {
      merged.push(entry);
    }
  }

  await writeLoreJson(lorefolderPath, FILENAME, merged);

  // Sync to Campaign Codex NPC journals
  const ccJournals = getJournalsInFolder(CC_FOLDER);
  let journalsUpdated = 0;
  const journalsMissing: string[] = [];

  for (const entry of entries) {
    const journal = findMatchingJournal(entry.name, ccJournals);
    if (journal) {
      await syncDossierStatus(journal, entry);
      journalsUpdated++;
    } else {
      journalsMissing.push(entry.name);
    }
  }

  if (journalsMissing.length > 0) {
    console.info(
      `LoreBridge NPC Status: No matching journal for: ${journalsMissing.join(", ")}`,
    );
  }

  return { written: entries.length, journalsUpdated, journalsMissing };
}

// ---------------------------------------------------------------------------
// Public UI entry points
// ---------------------------------------------------------------------------

/** Initialize: process ALL session log pages. */
export async function initializeNpcStatusTracker(): Promise<void> {
  if (!game.user?.isGM) return;

  const pages = sessionReadAll();
  if (pages.length === 0) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  const confirmed = await confirmDialog(
    "NPC Status Tracker — Initialize",
    `<p>This will process <strong>${pages.length}</strong> session log page(s) using AI to identify NPC status changes across all sessions.</p>
     <p style="color:#aaa;font-size:0.85em">This may take a while. Ambiguous entries will be queued for review.</p>`,
  );
  if (!confirmed) return;

  ui.notifications.info("LoreBridge NPC Status: Processing sessions…");

  const { definite, ambiguous } = await processPages(pages);

  let allEntries = [...definite];

  // Let GM review ambiguous entries
  if (ambiguous.length > 0) {
    const reviewed = await showAmbiguousReview(ambiguous);
    for (const r of reviewed) {
      allEntries.push({
        name: r.name,
        status: r.suggestedStatus,
        session: r.session,
        ...(r.killedBy ? { killedBy: r.killedBy } : {}),
        ...(r.note ? { note: r.note } : {}),
      });
    }
  }

  const settings = getLoreBridgeSettings();
  const { written, journalsUpdated, journalsMissing } = await applyResults(
    allEntries,
    settings.lorefolderPath,
  );

  const missingHtml =
    journalsMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${journalsMissing.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "NPC Status — Complete",
    `<p>✅ Wrote <strong>${written}</strong> NPC status entries.</p>
     <p>📖 Updated <strong>${journalsUpdated}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

/** Current: process only the latest session log page. */
export async function updateNpcStatusFromLatest(): Promise<void> {
  if (!game.user?.isGM) return;

  const page = sessionReadLatest();
  if (!page) {
    ui.notifications.warn("LoreBridge: No session log pages found.");
    return;
  }

  ui.notifications.info(`LoreBridge NPC Status: Analyzing session ${page.sessionNumber}…`);

  const results = await extractStatusFromPage(page);
  if (results.length === 0) {
    ui.notifications.info("LoreBridge NPC Status: No status changes detected in the latest session.");
    return;
  }

  const entries: NpcStatusEntry[] = results.map((r) => ({
    name: r.name,
    status: normalizeStatus(r.status),
    session: page.sessionNumber,
    ...(r.killedBy ? { killedBy: r.killedBy } : {}),
    ...(r.note ? { note: r.note } : {}),
  }));

  // Show preview dialog
  const rowsHtml = entries
    .map(
      (e) =>
        `<tr>
          <td style="padding:3px 6px">${escHtml(e.name)}</td>
          <td style="padding:3px 6px;color:#aaa">${escHtml(e.status)}</td>
          <td style="padding:3px 6px;font-size:0.85em;color:#888">${escHtml(e.note ?? e.killedBy ?? "")}</td>
        </tr>`,
    )
    .join("");

  const confirmed = await confirmDialog(
    `NPC Status — Session ${page.sessionNumber}`,
    `<p>Detected <strong>${entries.length}</strong> NPC status change(s):</p>
     <table style="width:100%;border-collapse:collapse;font-size:0.85em">
       <thead><tr style="color:#888;text-align:left"><th style="padding:3px 6px">NPC</th><th style="padding:3px 6px">Status</th><th style="padding:3px 6px">Note</th></tr></thead>
       <tbody>${rowsHtml}</tbody>
     </table>`,
  );
  if (!confirmed) return;

  const settings = getLoreBridgeSettings();
  const { written, journalsUpdated, journalsMissing } = await applyResults(
    entries,
    settings.lorefolderPath,
  );

  const missingHtml =
    journalsMissing.length > 0
      ? `<p style="color:#c88;font-size:0.85em">No matching journal: ${journalsMissing.map(escHtml).join(", ")}</p>`
      : "";

  showResultDialog(
    "NPC Status — Complete",
    `<p>✅ Updated <strong>${written}</strong> NPC status entries from session ${page.sessionNumber}.</p>
     <p>📖 Synced <strong>${journalsUpdated}</strong> Campaign Codex journal(s).</p>
     ${missingHtml}`,
  );
}

/** Backup: commit npc_status.json to GitHub. */
export async function backupNpcStatus(): Promise<void> {
  if (!game.user?.isGM) return;
  try {
    ui.notifications.info("LoreBridge NPC Status: Backing up to GitHub…");
    const settings = getLoreBridgeSettings();
    const sessionNum = latestSessionNumber();
    await backupLoreFile(
      settings.lorefolderPath,
      FILENAME,
      `LoreBridge: NPC Status backup — Session ${sessionNum}`,
    );
    ui.notifications.info("LoreBridge NPC Status: Backup complete.");
  } catch (err) {
    ui.notifications.error(
      `LoreBridge NPC Status backup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
