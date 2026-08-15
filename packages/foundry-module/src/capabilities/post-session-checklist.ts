/**
 * Post-Session Checklist — issue #277
 *
 * Chains all session-based updates in sequence after a game session ends.
 * Each tracker step uses its own "Latest" function (including its own dialogs);
 * the checklist sequences them and shows a final summary.
 */

import { requireFoundryGm } from "./errors.js";
import { readLatest as sessionReadLatest } from "./session-log-reader.js";
import { updateNpcStatusFromLatest } from "./tracker-npc-status.js";
import { updateNpcEncountersFromLatest } from "./tracker-npc-encounters.js";
import { updateQuestStatusFromLatest } from "./tracker-quest-status.js";
import { updateRegionVisitsFromLatest } from "./tracker-region-visits.js";
import { syncPermissionsCore, type PermissionsSyncResult } from "./permissions-sync.js";
import { backupAllCore, type BackupAllResult } from "./backup-all.js";
import { showResultDialog, escHtml } from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Setup dialog
// ---------------------------------------------------------------------------

type ChecklistConfig = {
  sessionNumber: number;
  runNpcStatus: boolean;
  runNpcEncounters: boolean;
  runQuestStatus: boolean;
  runRegionVisits: boolean;
  runPermissionsSync: boolean;
  runGitHubBackup: boolean;
};

async function showSetupDialog(detectedSession: number): Promise<ChecklistConfig | null> {
  return new Promise((resolve) => {
    let resolved = false;

    const steps: Array<[string, string, boolean]> = [
      ["lb-npc-status", "NPC Status", true],
      ["lb-npc-encounters", "NPC Encounters", true],
      ["lb-quest-status", "Quest Status", true],
      ["lb-region-visits", "Region Visits", true],
      ["lb-perms-sync", "Permissions Sync", true],
      ["lb-github-backup", "GitHub Backup", true],
    ];

    const checkboxRows = steps
      .map(
        ([id, label]) =>
          `<label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;cursor:pointer">
             <input type="checkbox" id="${id}" checked> ${escHtml(label)}
           </label>`,
      )
      .join("");

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: "End of Session Checklist", resizable: true },
      position: { width: 420, height: "auto" },
      content: `<div style="padding:0.5rem;font-size:0.9em">
        <div style="margin-bottom:0.75rem">
          <label style="display:block;margin-bottom:0.3rem;font-weight:bold">Session completed:</label>
          <input type="number" id="lb-session-num" value="${detectedSession}" min="1"
            style="width:80px;padding:3px 6px;border:1px solid #555;background:#222;color:#eee;border-radius:3px">
        </div>
        <p style="margin:0 0 0.4rem;color:#aaa">Steps to run:</p>
        ${checkboxRows}
        <p style="margin-top:0.5rem;color:#888;font-size:0.8em">
          Skipped steps still appear in the final GitHub backup commit.
        </p>
      </div>`,
      buttons: [
        {
          action: "run",
          label: "Run Checklist",
          icon: "fas fa-play",
          default: true,
          callback: () => {
            if (resolved) return;
            resolved = true;
            const num = parseInt(
              (document.getElementById("lb-session-num") as HTMLInputElement | null)?.value ?? "",
              10,
            );
            const get = (id: string) =>
              (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
            resolve({
              sessionNumber: Number.isFinite(num) ? num : detectedSession,
              runNpcStatus: get("lb-npc-status"),
              runNpcEncounters: get("lb-npc-encounters"),
              runQuestStatus: get("lb-quest-status"),
              runRegionVisits: get("lb-region-visits"),
              runPermissionsSync: get("lb-perms-sync"),
              runGitHubBackup: get("lb-github-backup"),
            });
          },
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fas fa-times",
          callback: () => {
            if (!resolved) { resolved = true; resolve(null); }
          },
        },
      ],
    });

    void dialog.render({ force: true });
    const dialogWithId = dialog as unknown as { id: string };
    const onClose = (app: unknown) => {
      if ((app as { id?: string }).id === dialogWithId.id) {
        if (!resolved) { resolved = true; resolve(null); }
        Hooks.off("closeApplication", onClose);
      }
    };
    Hooks.on("closeApplication", onClose);
  });
}

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------

type StepResult =
  | { kind: "skipped" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

async function runStep(
  label: string,
  fn: () => Promise<void>,
): Promise<StepResult> {
  ui.notifications.info(`LoreBridge: ${label}…`);
  try {
    await fn();
    return { kind: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`LoreBridge Post-Session Checklist — ${label} failed:`, err);
    return { kind: "error", message };
  }
}

// ---------------------------------------------------------------------------
// Summary dialog
// ---------------------------------------------------------------------------

function buildSummary(
  steps: Array<{ label: string; result: StepResult }>,
  permsResult: PermissionsSyncResult | null,
  backupResult: BackupAllResult | null,
): string {
  const rows = steps.map(({ label, result }) => {
    if (result.kind === "skipped") {
      return `<tr><td style="padding:3px 8px">${escHtml(label)}</td><td style="padding:3px 8px;color:#888">skipped</td></tr>`;
    }
    if (result.kind === "error") {
      return `<tr><td style="padding:3px 8px">${escHtml(label)}</td><td style="padding:3px 8px;color:#c88">⚠ ${escHtml(result.message)}</td></tr>`;
    }
    return `<tr><td style="padding:3px 8px">${escHtml(label)}</td><td style="padding:3px 8px;color:#5dbb63">✅ done</td></tr>`;
  });

  let extra = "";
  if (permsResult) {
    const { npc, region, quest } = permsResult;
    extra += `<p style="margin:0.5rem 0 0.25rem;font-size:0.85em;color:#aaa">Observer set — NPCs: ${npc.applied}, Regions: ${region.applied}, Quests: ${quest.applied}</p>`;
  }
  if (backupResult) {
    extra += `<p style="font-size:0.85em;color:#aaa">GitHub: ${backupResult.filesCommitted} file(s) + ${backupResult.macrosExported} macro(s) committed.</p>`;
    if (backupResult.errors.length > 0) {
      extra += `<p style="font-size:0.8em;color:#c88">Backup errors: ${backupResult.errors.map(escHtml).join("; ")}</p>`;
    }
  }

  return `<table style="width:100%;border-collapse:collapse;font-size:0.9em">${rows.join("")}</table>${extra}`;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runPostSessionChecklist(): Promise<void> {
  requireFoundryGm("runPostSessionChecklist");

  const latest = sessionReadLatest();
  const detectedSession = latest?.sessionNumber ?? 1;

  const config = await showSetupDialog(detectedSession);
  if (!config) return;

  const { sessionNumber } = config;

  const trackerSteps: Array<{ label: string; enabled: boolean; fn: () => Promise<void> }> = [
    { label: "NPC Status",    enabled: config.runNpcStatus,     fn: updateNpcStatusFromLatest },
    { label: "NPC Encounters",enabled: config.runNpcEncounters, fn: updateNpcEncountersFromLatest },
    { label: "Quest Status",  enabled: config.runQuestStatus,   fn: updateQuestStatusFromLatest },
    { label: "Region Visits", enabled: config.runRegionVisits,  fn: updateRegionVisitsFromLatest },
  ];

  const stepResults: Array<{ label: string; result: StepResult }> = [];

  for (const step of trackerSteps) {
    if (!step.enabled) {
      stepResults.push({ label: step.label, result: { kind: "skipped" } });
      continue;
    }
    const result = await runStep(step.label, step.fn);
    stepResults.push({ label: step.label, result });
  }

  // Permissions sync
  let permsResult: PermissionsSyncResult | null = null;
  if (config.runPermissionsSync) {
    ui.notifications.info("LoreBridge: Syncing permissions…");
    try {
      permsResult = await syncPermissionsCore();
      stepResults.push({ label: "Permissions Sync", result: { kind: "ok" } });
    } catch (err) {
      stepResults.push({
        label: "Permissions Sync",
        result: { kind: "error", message: err instanceof Error ? err.message : String(err) },
      });
    }
  } else {
    stepResults.push({ label: "Permissions Sync", result: { kind: "skipped" } });
  }

  // GitHub backup — always commits all existing JSON regardless of which steps ran
  let backupResult: BackupAllResult | null = null;
  if (config.runGitHubBackup) {
    ui.notifications.info("LoreBridge: Backing up to GitHub…");
    try {
      backupResult = await backupAllCore(
        sessionNumber,
        `LoreBridge: Post-session update — Session ${sessionNumber} (${new Date().toISOString().slice(0, 10)})`,
      );
      stepResults.push({ label: "GitHub Backup", result: { kind: "ok" } });
    } catch (err) {
      stepResults.push({
        label: "GitHub Backup",
        result: { kind: "error", message: err instanceof Error ? err.message : String(err) },
      });
    }
  } else {
    stepResults.push({ label: "GitHub Backup", result: { kind: "skipped" } });
  }

  showResultDialog(
    `Post-Session Checklist — Session ${sessionNumber}`,
    buildSummary(stepResults, permsResult, backupResult),
    560,
  );
}
