import { validateApproveWriteResult, type ApproveWriteOutput } from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";

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
