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

  const content = `
    <div class="lorebridge-write-approval">
      <h3>LoreBridge — AI Write Proposal</h3>
      <p><strong>Journal:</strong> ${payload.journalName}</p>
      <p><strong>Page:</strong> ${payload.pageName}</p>
      <p><strong>Rationale:</strong> ${payload.rationale}</p>
      <details>
        <summary>View proposed changes</summary>
        <div style="max-height:200px;overflow-y:auto;background:#1a1a1a;color:#eee;padding:8px;border-radius:4px;margin-top:4px;font-size:0.85em;white-space:pre-wrap;">${payload.proposedContent}</div>
      </details>
      <p style="font-size:0.8em;color:#888;">Expires at ${expiresStr}</p>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" data-action="approve" data-token="${payload.token}" style="flex:1;background:#2d6a2d;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;">Approve</button>
        <button type="button" data-action="reject" data-token="${payload.token}" style="flex:1;background:#6a2d2d;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;">Reject</button>
      </div>
    </div>
  `;

  await ChatMessage.create({
    content,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
    flags: { [MODULE_ID]: { [FLAG_WRITE_TOKEN]: payload.token } },
  });
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
