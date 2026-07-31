import { validateApproveWriteResult, type ApproveWriteOutput } from "@lorebridge/shared/capabilities";
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

  const dialogContent = `
    <div style="margin-bottom:8px;">
      <p><strong>Journal:</strong> ${payload.journalName}</p>
      <p><strong>Page:</strong> ${payload.pageName}</p>
      <p><strong>Rationale:</strong> ${payload.rationale}</p>
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">View proposed changes</summary>
        <div style="max-height:200px;overflow-y:auto;border:1px solid #999;border-radius:4px;margin-top:4px;padding:8px;font-size:0.85em;background:#f5f5f0;color:#222;">
          <div style="background:#f5f5f0;color:#222;">${payload.proposedContent}</div>
        </div>
      </details>
      <p style="margin-top:8px;font-size:0.8em;color:#888;">Expires at ${expiresStr}</p>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — AI Write Proposal", resizable: true },
    position: { width: 500, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "approve",
        label: "Approve",
        icon: "fas fa-check",
        callback: () => {
          void approveWrite(payload.token).then(() => {
            ui.notifications.info(`LoreBridge: "${payload.pageName}" updated.`);
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

  await page.update({ "text.content": proposedContent });

  console.info(`LoreBridge | Write complete for "${pageName}"`, {
    journalId,
    pageId,
    previousContent,
    newContent: proposedContent,
  });

  return { success: true, journalId, pageId, pageName };
}
