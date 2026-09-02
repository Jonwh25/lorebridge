import {
  type QuestObjective,
  type QuestObjectiveStatus,
  type GetQuestObjectivesInput,
  type GetQuestObjectivesOutput,
  validateApproveCcQuestResult,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";
import { ApprovalQueuePanel } from "../approval-queue-panel.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestObjectivesApprovalPayload = {
  token: string;
  journalId: string;
  journalName: string;
  currentObjectives: QuestObjective[];
  proposedObjectives: QuestObjective[];
  rationale: string;
  expiresAt: string;
};

type QueuedQuestProposal = QuestObjectivesApprovalPayload & {
  diffHtml: string;
  diffSummary: string;
};

// ---------------------------------------------------------------------------
// CC data types (mirrors the CC flag shape)
// ---------------------------------------------------------------------------

type CcQuestData = {
  quests?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Capability handler — read quest objectives from Foundry
// ---------------------------------------------------------------------------

export function getQuestObjectives(input: GetQuestObjectivesInput): GetQuestObjectivesOutput {
  requireFoundryGm("getQuestObjectives");

  const { journalId } = input;
  if (typeof journalId !== "string" || !journalId.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "getQuestObjectives requires a non-empty journalId string.");
  }

  const journal = game.journal.get(journalId.trim());
  if (!journal) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${journalId}' not found in the loaded world.`);
  }

  const ccData = journal.getFlag("campaign-codex", "data") as CcQuestData | undefined;
  if (!ccData || !Array.isArray(ccData.quests) || ccData.quests.length === 0) {
    throw new LoreBridgeCapabilityError(
      "CAPABILITY_UNAVAILABLE",
      `Journal '${journal.name}' does not have Campaign Codex quest data. Ensure Campaign Codex is installed and this journal is a Quest type.`,
    );
  }

  const q0 = ccData.quests[0] as Record<string, unknown> ?? {};
  const objectives = (Array.isArray(q0["objectives"]) ? q0["objectives"] : []) as QuestObjective[];

  let questStatus: QuestObjectiveStatus = "active";
  if (q0["completed"] === true) questStatus = "completed";
  else if (q0["failed"] === true) questStatus = "failed";
  else if (q0["inactive"] === true) questStatus = "available";

  const sourceId = (game.world?.id ?? "unknown") as string;
  const sourceName = (game.world?.title ?? "Unknown World") as string;

  return {
    sourceId,
    sourceName,
    journalId: journal.id!,
    journalName: journal.name!,
    questStatus,
    objectives,
  };
}

// ---------------------------------------------------------------------------
// Objective diff rendering
// ---------------------------------------------------------------------------

function objectiveToLine(obj: QuestObjective, depth = 0): string[] {
  const prefix = "  ".repeat(depth);
  const statusMark = obj.completed ? "[x]" : obj.failed ? "[!]" : "[ ]";
  const text = obj.text?.trim() ?? "(no text)";
  const lines = [`${prefix}${statusMark} ${text}`];
  if (Array.isArray(obj.objectives)) {
    for (const child of obj.objectives) {
      lines.push(...objectiveToLine(child, depth + 1));
    }
  }
  return lines;
}

function objectivesToLines(objectives: QuestObjective[]): string[] {
  return objectives.flatMap((obj) => objectiveToLine(obj));
}

type DiffOp = { op: "equal" | "insert" | "delete"; text: string };

function computeDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = oldLines[i - 1] === newLines[j - 1]
        ? (dp[i - 1]![j - 1]! + 1)
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const result: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ op: "equal", text: oldLines[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({ op: "insert", text: newLines[j - 1]! });
      j--;
    } else {
      result.unshift({ op: "delete", text: oldLines[i - 1]! });
      i--;
    }
  }
  return result;
}

function renderDiffHtml(ops: DiffOp[]): string {
  if (ops.length === 0) return "<p style='color:#888;font-style:italic'>No objectives to compare.</p>";
  const hasChanges = ops.some((o) => o.op !== "equal");
  if (!hasChanges) return "<p style='color:#888;font-style:italic'>Objectives are identical.</p>";
  return ops.map((op) => {
    const esc = op.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (op.op === "insert") {
      return `<div style="background:#1a4a1a;color:#6fcf6f;padding:2px 6px;margin:1px 0;border-left:3px solid #4caf50;font-family:monospace;font-size:0.85em;white-space:pre-wrap">+ ${esc}</div>`;
    }
    if (op.op === "delete") {
      return `<div style="background:#4a1a1a;color:#cf6f6f;padding:2px 6px;margin:1px 0;border-left:3px solid #f44336;font-family:monospace;font-size:0.85em;white-space:pre-wrap;text-decoration:line-through">- ${esc}</div>`;
    }
    return `<div style="color:#aaa;padding:2px 6px;margin:1px 0;font-family:monospace;font-size:0.85em;white-space:pre-wrap">  ${esc}</div>`;
  }).join("\n");
}

// ---------------------------------------------------------------------------
// Approval panel
// ---------------------------------------------------------------------------

const _pendingQuestProposals = new Map<string, QueuedQuestProposal>();
let _questPanel: QuestObjectivesBatchPanel | null = null;

function _escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function _buildQuestPanelHtml(proposals: QueuedQuestProposal[]): string {
  if (proposals.length === 0) {
    return `<p style="color:#888;text-align:center;padding:16px 0;">No pending quest objective proposals.</p>`;
  }
  const count = proposals.length;
  const header = `
    <div style="display:flex;gap:8px;margin-bottom:12px;padding:0 2px;">
      <button data-action="approve-all" style="flex:1;padding:6px 10px;background:#1a3a1a;color:#6fcf6f;border:1px solid #3a6a3a;border-radius:3px;cursor:pointer;">
        <i class="fas fa-check-double"></i> Approve All (${count})
      </button>
      <button data-action="reject-all" style="flex:1;padding:6px 10px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a;border-radius:3px;cursor:pointer;">
        <i class="fas fa-times-circle"></i> Reject All (${count})
      </button>
    </div>
  `;
  const rows = proposals.map((p) => {
    const expiresStr = new Date(p.expiresAt).toLocaleTimeString();
    return `
      <div style="border:1px solid #444;border-radius:4px;padding:10px;margin-bottom:8px;">
        <div style="font-weight:bold;margin-bottom:4px;">
          <i class="fas fa-scroll" style="color:#c9a84c;margin-right:4px;"></i>${_escapeHtml(p.journalName)} — Quest Objectives
        </div>
        <div style="margin-bottom:4px;font-size:0.9em;">${p.diffSummary}</div>
        <div style="margin-bottom:6px;font-size:0.8em;color:#888;">${_escapeHtml(p.rationale)}</div>
        <details style="margin-bottom:8px;">
          <summary style="cursor:pointer;color:#aaa;font-size:0.82em;">Show diff</summary>
          <div style="max-height:200px;overflow-y:auto;border:1px solid #333;border-radius:3px;margin-top:6px;padding:4px;background:#111;">
            ${p.diffHtml}
          </div>
        </details>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.75em;color:#666;">Expires ${expiresStr}</span>
          <div style="display:flex;gap:6px;">
            <button data-action="reject" data-token="${_escapeAttr(p.token)}"
              style="padding:4px 12px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a;border-radius:3px;cursor:pointer;">
              <i class="fas fa-times"></i> Reject
            </button>
            <button data-action="approve" data-token="${_escapeAttr(p.token)}"
              style="padding:4px 12px;background:#1a3a1a;color:#6fcf6f;border:1px solid #3a6a3a;border-radius:3px;cursor:pointer;">
              <i class="fas fa-check"></i> Approve
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
  return `<div style="padding:8px 4px;">${header}${rows}</div>`;
}

class QuestObjectivesBatchPanel extends ApprovalQueuePanel {
  static override DEFAULT_OPTIONS = {
    id: "lorebridge-quest-objectives-approval",
    classes: ["lorebridge-approval-queue", "lorebridge-quest-objectives-approval"],
    window: { title: "LoreBridge — Quest Objective Proposals", resizable: true },
    position: { width: 620, height: 560 },
  };

  protected override renderApprovalQueueHtml(): string {
    return _buildQuestPanelHtml(Array.from(_pendingQuestProposals.values()));
  }

  override _onClickAction(_event: PointerEvent, target: HTMLElement): void | Promise<void> {
    const action = target.dataset.action;
    const token = target.dataset.token ?? "";
    if (action === "approve") return _doQuestApprove(token, this);
    if (action === "reject") return _doQuestReject(token, this);
    if (action === "approve-all") return _doQuestApproveAll(this);
    if (action === "reject-all") return _doQuestRejectAll(this);
  }
}

async function _doQuestApprove(token: string, panel: QuestObjectivesBatchPanel): Promise<void> {
  const proposal = _pendingQuestProposals.get(token);
  if (!proposal) return;
  _pendingQuestProposals.delete(token);
  try {
    await approveQuestObjectivesWrite(token);
    ui.notifications.info(`LoreBridge: Quest objectives for "${proposal.journalName}" updated.`);
  } catch (err: unknown) {
    _pendingQuestProposals.set(token, proposal);
    ui.notifications.error(`LoreBridge: Approve failed — ${err instanceof Error ? err.message : String(err)}`);
  }
  await _refreshOrCloseQuest(panel);
}

async function _doQuestReject(token: string, panel: QuestObjectivesBatchPanel): Promise<void> {
  const proposal = _pendingQuestProposals.get(token);
  if (!proposal) return;
  _pendingQuestProposals.delete(token);
  try {
    await rejectQuestObjectivesWrite(token);
    ui.notifications.info("LoreBridge: Quest objectives proposal rejected.");
  } catch (err: unknown) {
    _pendingQuestProposals.set(token, proposal);
    ui.notifications.error(`LoreBridge: Reject failed — ${err instanceof Error ? err.message : String(err)}`);
  }
  await _refreshOrCloseQuest(panel);
}

async function _doQuestApproveAll(panel: QuestObjectivesBatchPanel): Promise<void> {
  const tokens = Array.from(_pendingQuestProposals.keys());
  for (const token of tokens) await _doQuestApprove(token, panel);
}

async function _doQuestRejectAll(panel: QuestObjectivesBatchPanel): Promise<void> {
  const tokens = Array.from(_pendingQuestProposals.keys());
  for (const token of tokens) await _doQuestReject(token, panel);
}

async function _refreshOrCloseQuest(panel: QuestObjectivesBatchPanel): Promise<void> {
  if (_pendingQuestProposals.size === 0) {
    await panel.close();
    _questPanel = null;
  } else {
    await panel.render({ force: true });
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function showQuestObjectivesApprovalChat(payload: QuestObjectivesApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const oldLines = objectivesToLines(payload.currentObjectives);
  const newLines = objectivesToLines(payload.proposedObjectives);
  const diffOps = computeDiff(oldLines, newLines);
  const diffHtml = renderDiffHtml(diffOps);
  const addedCount = diffOps.filter((o) => o.op === "insert").length;
  const removedCount = diffOps.filter((o) => o.op === "delete").length;
  const diffSummary = `<span style="color:#6fcf6f">+${addedCount}</span> / <span style="color:#cf6f6f">-${removedCount}</span> objective lines`;

  _pendingQuestProposals.set(payload.token, { ...payload, diffHtml, diffSummary });

  if (!_questPanel || !_questPanel.rendered) {
    _questPanel = new QuestObjectivesBatchPanel();
    await _questPanel.render({ force: true });
  } else {
    await _questPanel.render({ force: true });
    _questPanel.bringToFront();
  }
}

export async function rejectQuestObjectivesWrite(token: string): Promise<void> {
  requireFoundryGm("rejectQuestObjectivesWrite");
  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "rejectQuestObjectivesWrite requires a non-empty token.");
  }
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  if (!settings.clientToken) throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This browser is not paired with the LoreBridge backend.");

  const url = settings.backendUrl.endsWith("/")
    ? `${settings.backendUrl}v1/cc-quest/reject`
    : `${settings.backendUrl}/v1/cc-quest/reject`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.clientToken}`, "content-type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }

  if (response.status === 401 || response.status === 403) throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  if (response.status === 404 || response.status === 410) throw new LoreBridgeCapabilityError("NOT_FOUND", "Quest write token not found or already used.");
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body as { error?: { message?: string } }).error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }
}

export async function approveQuestObjectivesWrite(token: string): Promise<void> {
  requireFoundryGm("approveQuestObjectivesWrite");
  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "approveQuestObjectivesWrite requires a non-empty token.");
  }
  const settings = getLoreBridgeSettings();
  if (!settings.writesEnabled) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "AI-proposed writes are disabled. Enable 'Enable AI-Proposed Writes' in LoreBridge world settings.");
  }
  if (!settings.backendUrl) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  if (!settings.clientToken) throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This browser is not paired with the LoreBridge backend.");

  const url = settings.backendUrl.endsWith("/")
    ? `${settings.backendUrl}v1/cc-quest/approve`
    : `${settings.backendUrl}/v1/cc-quest/approve`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.clientToken}`, "content-type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }

  if (response.status === 401 || response.status === 403) throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  if (response.status === 404) throw new LoreBridgeCapabilityError("NOT_FOUND", "Quest write token not found. It may have expired or already been used.");
  if (response.status === 410) throw new LoreBridgeCapabilityError("NOT_FOUND", "This quest write token has already been used or has expired.");
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body as { error?: { message?: string } }).error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }

  const raw = await response.json();
  const validation = validateApproveCcQuestResult(raw);
  if (!validation.valid || !validation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "The backend returned an invalid quest approve response.", {
      details: { validationErrors: validation.errors },
    });
  }

  const { journalId, journalName, proposedObjectives } = validation.value;

  const journal = game.journal.get(journalId);
  if (!journal) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${journalId}' not found in the loaded world.`);
  }

  const ccData = (journal.getFlag("campaign-codex", "data") as CcQuestData | undefined) ?? {};
  const existingQuests = (ccData["quests"] as unknown[]) ?? [{}];
  const q0 = (existingQuests[0] as Record<string, unknown>) ?? {};
  const updatedQuest = { ...q0, objectives: proposedObjectives };

  await journal.setFlag("campaign-codex", "data", {
    ...ccData,
    quests: [updatedQuest, ...existingQuests.slice(1)],
  });

  console.info(`LoreBridge | Quest objectives updated for "${journalName}" (${journalId})`, {
    token: token.trim(),
    objectiveCount: proposedObjectives.length,
  });
}
