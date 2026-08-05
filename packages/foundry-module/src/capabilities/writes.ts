import { validateApproveWriteResult, type ApproveWriteOutput, type RollbackAvailablePayload } from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const FLAG_WRITE_TOKEN = "writeToken";

export type WriteApprovalPayload = {
  token: string;
  journalId: string;
  pageId: string;
  pageName: string;
  journalName: string;
  currentContent: string;
  proposedContent: string;
  rationale: string;
  expiresAt: string;
};

// ---------------------------------------------------------------------------
// Paragraph-level diff (no external library)
// ---------------------------------------------------------------------------

type DiffOp = { op: "equal" | "insert" | "delete"; text: string };

function htmlToLines(html: string): string[] {
  return html
    .replace(/<\/?(p|h[1-6]|li|blockquote|div|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

function computeDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length;
  const n = newLines.length;
  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = oldLines[i - 1] === newLines[j - 1]
        ? (dp[i - 1]![j - 1]! + 1)
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  // Backtrack to produce diff ops
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
  if (ops.length === 0) return "<p style='color:#888;font-style:italic'>No text content to compare.</p>";

  const hasChanges = ops.some((o) => o.op !== "equal");
  if (!hasChanges) return "<p style='color:#888;font-style:italic'>Content is identical after stripping HTML.</p>";

  return ops
    .map((op) => {
      const escaped = op.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (op.op === "insert") {
        return `<div style="background:#1a4a1a;color:#6fcf6f;padding:2px 6px;margin:1px 0;border-left:3px solid #4caf50;font-family:monospace;font-size:0.85em;white-space:pre-wrap">+ ${escaped}</div>`;
      }
      if (op.op === "delete") {
        return `<div style="background:#4a1a1a;color:#cf6f6f;padding:2px 6px;margin:1px 0;border-left:3px solid #f44336;font-family:monospace;font-size:0.85em;white-space:pre-wrap;text-decoration:line-through">- ${escaped}</div>`;
      }
      return `<div style="color:#aaa;padding:2px 6px;margin:1px 0;font-family:monospace;font-size:0.85em;white-space:pre-wrap">  ${escaped}</div>`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Write approval dialog
// ---------------------------------------------------------------------------

export async function showWriteApprovalChat(payload: WriteApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
  const expiresDate = new Date(payload.expiresAt);
  const expiresStr = expiresDate.toLocaleTimeString();

  const whisperContent = `
    <p><strong>LoreBridge — AI Write Proposal</strong></p>
    <p><strong>Journal:</strong> ${payload.journalName} / ${payload.pageName}</p>
    <p><strong>Rationale:</strong> ${payload.rationale}</p>
    <p style="font-size:0.8em;color:#888;">Expires at ${expiresStr} — respond via the popup dialog.</p>
  `;

  await ChatMessage.create({
    content: whisperContent,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
    flags: { [MODULE_ID]: { [FLAG_WRITE_TOKEN]: payload.token } },
  });

  const diffOps = computeDiff(
    htmlToLines(payload.currentContent),
    htmlToLines(payload.proposedContent),
  );
  const diffHtml = renderDiffHtml(diffOps);
  const addedCount = diffOps.filter((o) => o.op === "insert").length;
  const removedCount = diffOps.filter((o) => o.op === "delete").length;
  const diffSummary = `<span style="color:#6fcf6f">+${addedCount}</span> / <span style="color:#cf6f6f">-${removedCount}</span> paragraphs`;

  const dialogContent = `
    <div style="margin-bottom:8px;">
      <p><strong>Journal:</strong> ${payload.journalName}</p>
      <p><strong>Page:</strong> ${payload.pageName}</p>
      <p><strong>Rationale:</strong> ${payload.rationale}</p>
      <details open style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">Diff — ${diffSummary}</summary>
        <div style="max-height:300px;overflow-y:auto;border:1px solid #555;border-radius:4px;margin-top:4px;padding:4px;background:#1a1a1a;">
          ${diffHtml}
        </div>
      </details>
      <p style="margin-top:8px;font-size:0.8em;color:#888;">Expires at ${expiresStr}</p>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — AI Write Proposal", resizable: true },
    position: { width: 560, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "approve",
        label: "Approve",
        icon: "fas fa-check",
        callback: () => {
          void approveWrite(payload.token).then(() => {
            ui.notifications.info(`LoreBridge: "${payload.pageName}" updated. Rollback available for 30 minutes.`);
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            ui.notifications.error(`LoreBridge: Approve failed — ${msg}`);
          });
        },
      },
      {
        action: "reject",
        label: "Reject",
        icon: "fas fa-times",
        default: true,
        callback: () => {
          void rejectWrite(payload.token).then(() => {
            ui.notifications.info("LoreBridge: Write proposal rejected.");
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            ui.notifications.error(`LoreBridge: Reject failed — ${msg}`);
          });
        },
      },
    ],
  }).render({ force: true });
}

// ---------------------------------------------------------------------------
// Rollback availability chat notification
// ---------------------------------------------------------------------------

export async function showRollbackAvailableChat(payload: RollbackAvailablePayload): Promise<void> {
  if (!game.user?.isGM) return;

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
  const expiresDate = new Date(payload.expiresAt);
  const expiresStr = expiresDate.toLocaleTimeString();

  // Inline onclick is stripped by Foundry's HTML sanitiser. The token is stored
  // in the message flag instead and wired up via registerRollbackChatHook().
  const whisperContent = `
    <p><strong>LoreBridge — Write Applied</strong></p>
    <p><strong>Journal:</strong> ${payload.journalName} / ${payload.pageName}</p>
    <p>Rollback available until <strong>${expiresStr}</strong>.</p>
    <button type="button" data-action="lb-rollback" style="margin-top:4px;padding:4px 10px;cursor:pointer;">
      <i class="fas fa-undo"></i> Request Rollback
    </button>
  `;

  await ChatMessage.create({
    content: whisperContent,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
    flags: { lorebridge: { rollbackAuditToken: payload.auditToken } },
  });
}

// ---------------------------------------------------------------------------
// renderChatMessage hook — wires up the rollback button
// ---------------------------------------------------------------------------

export function registerRollbackChatHook(): void {
  Hooks.on("renderChatMessage", (...args: unknown[]) => {
    const [rawMessage, rawHtml] = args;
    const message = rawMessage as { getFlag(scope: string, key: string): unknown };
    const auditToken = message.getFlag("lorebridge", "rollbackAuditToken");
    if (typeof auditToken !== "string" || !auditToken) return;

    const root = rawHtml instanceof HTMLElement ? rawHtml : undefined;
    const btn = root
      ? root.querySelector<HTMLButtonElement>("[data-action='lb-rollback']")
      : null;
    if (!btn) return;

    btn.addEventListener("click", () => {
      void rollbackWrite(auditToken).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        ui.notifications.error(`LoreBridge: Rollback failed — ${msg}`);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Rollback write
// ---------------------------------------------------------------------------

export async function rollbackWrite(auditToken: string): Promise<void> {
  requireFoundryGm("rollbackWrite");

  if (typeof auditToken !== "string" || !auditToken.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "rollbackWrite requires a non-empty auditToken string.");
  }

  const settings = getLoreBridgeSettings();
  if (!settings.writesEnabled) {
    throw new LoreBridgeCapabilityError(
      "CAPABILITY_UNAVAILABLE",
      "AI-proposed writes are disabled. Enable 'Enable AI-Proposed Writes' in LoreBridge world settings.",
    );
  }
  if (!settings.backendUrl) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  }
  if (!settings.clientToken) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This browser is not paired with the LoreBridge backend.");
  }

  const url = settings.backendUrl.endsWith("/")
    ? `${settings.backendUrl}v1/write/rollback`
    : `${settings.backendUrl}/v1/write/rollback`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.clientToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ auditToken: auditToken.trim() }),
    });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }

  if (response.status === 401 || response.status === 403) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  }
  if (response.status === 404) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "Audit token not found. The rollback window may have expired.");
  }
  if (response.status === 410) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "This write has already been rolled back or the rollback window has expired.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body as { error?: { message?: string } }).error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }

  ui.notifications.info("LoreBridge: Rollback approval request sent — approve it in the popup dialog.");
}

// ---------------------------------------------------------------------------
// Roll table approval dialog
// ---------------------------------------------------------------------------

export type RollTableApprovalPayload = {
  name: string;
  entries: Array<{ weight: number; text: string }>;
  prompt: string;
};

export async function showRollTableApprovalChat(payload: RollTableApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);

  const entriesHtml = payload.entries
    .map((e, i) => `<li><strong>${i + 1}.</strong> ${e.text}</li>`)
    .join("\n");

  const whisperContent = `
    <p><strong>LoreBridge — Roll Table Proposal</strong></p>
    <p><strong>Table:</strong> ${payload.name}</p>
    <p><strong>Prompt:</strong> ${payload.prompt}</p>
    <p style="font-size:0.8em;color:#888;">Respond via the popup dialog.</p>
  `;

  await ChatMessage.create({
    content: whisperContent,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  const dialogContent = `
    <div style="margin-bottom:8px;">
      <p><strong>Table name:</strong> ${payload.name}</p>
      <p><strong>Prompt:</strong> ${payload.prompt}</p>
      <details open style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">Preview entries (${payload.entries.length})</summary>
        <ol style="max-height:300px;overflow-y:auto;border:1px solid #999;border-radius:4px;margin-top:4px;padding:8px 8px 8px 28px;font-size:0.85em;background:#f5f5f0;color:#222;">
          ${entriesHtml}
        </ol>
      </details>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — Roll Table Proposal", resizable: true },
    position: { width: 520, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "approve",
        label: "Create Roll Table",
        icon: "fas fa-dice",
        callback: () => {
          void (async () => {
            try {
              const count = payload.entries.length;
              const results = payload.entries.map((e, i) => ({
                type: "text" as const,
                text: e.text,
                weight: e.weight,
                range: [i + 1, i + 1] as [number, number],
              }));
              await RollTable.create({
                name: payload.name,
                formula: `1d${count}`,
                results,
              });
              ui.notifications.info(`LoreBridge: Roll table "${payload.name}" created.`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              ui.notifications.error(`LoreBridge: Roll table creation failed — ${msg}`);
            }
          })();
        },
      },
      {
        action: "reject",
        label: "Reject",
        icon: "fas fa-times",
        default: true,
        callback: () => {
          ui.notifications.info("LoreBridge: Roll table proposal rejected.");
        },
      },
    ],
  }).render({ force: true });
}

// ---------------------------------------------------------------------------
// Core approve / reject
// ---------------------------------------------------------------------------

export async function rejectWrite(token: string): Promise<void> {
  requireFoundryGm("rejectWrite");

  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "rejectWrite requires a non-empty token string.");
  }

  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  }
  if (!settings.clientToken) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This browser is not paired with the LoreBridge backend.");
  }

  const url = settings.backendUrl.endsWith("/")
    ? `${settings.backendUrl}v1/write/reject`
    : `${settings.backendUrl}/v1/write/reject`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.clientToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: token.trim() }),
    });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }

  if (response.status === 401 || response.status === 403) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  }
  if (response.status === 404 || response.status === 410) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "Write token not found. It may have already expired or been used.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body as { error?: { message?: string } }).error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }

  console.info(`LoreBridge | Write rejected for token ${token.trim()}`);
}

export async function approveWrite(token: string): Promise<ApproveWriteOutput> {
  requireFoundryGm("approveWrite");

  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "approveWrite requires a non-empty token string.");
  }

  const settings = getLoreBridgeSettings();

  if (!settings.writesEnabled) {
    throw new LoreBridgeCapabilityError(
      "CAPABILITY_UNAVAILABLE",
      "AI-proposed writes are disabled. Enable 'Enable AI-Proposed Writes' in LoreBridge world settings.",
    );
  }
  if (!settings.backendUrl) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  }
  if (!settings.clientToken) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This browser is not paired with the LoreBridge backend.");
  }

  const url = settings.backendUrl.endsWith("/")
    ? `${settings.backendUrl}v1/write/approve`
    : `${settings.backendUrl}/v1/write/approve`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.clientToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: token.trim() }),
    });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }

  if (response.status === 401 || response.status === 403) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  }
  if (response.status === 404) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "Write token not found. It may have expired or already been used.");
  }
  if (response.status === 410) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", "This write token has already been used or has expired.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body as { error?: { message?: string } }).error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }

  const raw = await response.json();
  const validation = validateApproveWriteResult(raw);
  if (!validation.valid || !validation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "The backend returned an invalid approve response.", {
      details: { validationErrors: validation.errors },
    });
  }

  const { journalId, pageId, pageName, proposedContent } = validation.value;

  const journal = game.journal.get(journalId);
  if (!journal) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${journalId}' not found in the loaded world.`);
  }
  const page = journal.pages.get(pageId);
  if (!page) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Page '${pageId}' not found in journal '${journal.name}'.`);
  }

  const previousContent = page.text?.content ?? "";

  console.info(`LoreBridge | Write approved for "${pageName}" (${journalId}/${pageId})`, {
    token: token.trim(),
    previousContent,
    proposedContent,
  });

  // Close the journal sheet before writing to avoid a Foundry v14 ProseMirror
  // collision: programmatic page.update() while the editor is open causes
  // _onUsersEditing to fire on the same client, crashing the ProseMirror menu.
  const sheet = journal.sheet as { rendered?: boolean; close?: () => Promise<void>; render?: (force: boolean) => void } | undefined;
  const wasRendered = sheet?.rendered === true;
  if (wasRendered) await sheet?.close?.();

  await page.update({ "text.content": proposedContent });

  if (wasRendered) sheet?.render?.(true);

  console.info(`LoreBridge | Write complete for "${pageName}"`, {
    journalId,
    pageId,
    previousContent,
    newContent: proposedContent,
  });

  return { success: true, journalId, pageId, pageName };
}
