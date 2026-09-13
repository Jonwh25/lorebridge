import {
  type GetNpcDossierContextInput,
  type GetNpcDossierContextOutput,
  type GetFactionContextInput,
  type GetFactionContextOutput,
  type ApproveNpcDossierResult,
  type ApproveFactionProfileResult,
  validateApproveNpcDossierResult,
  validateApproveFactionProfileResult,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";
import { ApprovalQueuePanel } from "../approval-queue-panel.js";

// ---------------------------------------------------------------------------
// Foundry type stubs
// ---------------------------------------------------------------------------

type JournalWithFlags = {
  id: string | null;
  name: string | null;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  pages?: Iterable<{ id: string; name?: string; text?: { content?: string } }>;
  flags?: Record<string, unknown>;
};

type ActorWithFlags = {
  id: string | null;
  name: string | null;
  getFlag(scope: string, key: string): unknown;
};

// ---------------------------------------------------------------------------
// Context capability handlers
// ---------------------------------------------------------------------------

export function getNpcDossierContext(input: GetNpcDossierContextInput): GetNpcDossierContextOutput {
  requireFoundryGm("getNpcDossierContext");

  const { journalId } = input;
  if (typeof journalId !== "string" || !journalId.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "getNpcDossierContext requires a non-empty journalId string.");
  }

  const journal = (game.journal as { get(id: string): JournalWithFlags | undefined }).get(journalId.trim());
  if (!journal) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${journalId}' not found in the loaded world.`);
  }

  const ccData = journal.getFlag("campaign-codex", "data") as Record<string, unknown> | undefined;

  // Read CC NPC identity fields from the npcDossier identity section
  const npcDossier = journal.getFlag("lorebridge", "npcDossier") as Record<string, Record<string, unknown>> | undefined;
  const identity = (npcDossier?.["identity"] ?? {}) as Record<string, unknown>;
  const ccRace = typeof identity["race"] === "string" && identity["race"].trim() ? identity["race"].trim() : undefined;
  const ccClass = typeof identity["occupationOrClass"] === "string" && identity["occupationOrClass"].trim() ? identity["occupationOrClass"].trim() : undefined;
  const ccOccupation = ccClass;

  // Find linked actor via CC flag
  const linkedActorId = typeof ccData?.["actorId"] === "string" ? ccData["actorId"] as string : undefined;
  let linkedActorName: string | undefined;
  let npcProfile: Record<string, Record<string, string>> | undefined;

  if (linkedActorId) {
    const actor = (game.actors as { get(id: string): ActorWithFlags | undefined }).get(linkedActorId);
    if (actor) {
      linkedActorName = actor.name ?? undefined;
      const raw = actor.getFlag("lorebridge", "npcProfile");
      if (raw && typeof raw === "object") {
        npcProfile = raw as Record<string, Record<string, string>>;
      }
    }
  }

  const npcCtx: import("@lorebridge/shared/capabilities").NpcDossierContextData = {
    journalId: journal.id!,
    journalName: journal.name!,
  };
  if (ccRace) npcCtx.ccRace = ccRace;
  if (ccClass) npcCtx.ccClass = ccClass;
  if (ccOccupation) npcCtx.ccOccupation = ccOccupation;
  if (linkedActorId) npcCtx.linkedActorId = linkedActorId;
  if (linkedActorName) npcCtx.linkedActorName = linkedActorName;
  if (npcProfile) npcCtx.npcProfile = npcProfile;
  if (npcDossier) npcCtx.currentDossier = npcDossier as Record<string, unknown>;

  return {
    sourceId: (game.world?.id ?? "unknown") as string,
    sourceName: (game.world?.title ?? "Unknown World") as string,
    context: npcCtx,
  };
}

export function getFactionContext(input: GetFactionContextInput): GetFactionContextOutput {
  requireFoundryGm("getFactionContext");

  const { journalId } = input;
  if (typeof journalId !== "string" || !journalId.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "getFactionContext requires a non-empty journalId string.");
  }

  const journal = (game.journal as { get(id: string): JournalWithFlags | undefined }).get(journalId.trim());
  if (!journal) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${journalId}' not found in the loaded world.`);
  }

  const factionProfile = journal.getFlag("lorebridge", "factionProfile") as Record<string, unknown> | undefined;

  // Find the first page for content context
  let pageId: string | undefined;
  let pageContent: string | undefined;
  if (journal.pages) {
    for (const page of journal.pages) {
      pageId = page.id;
      pageContent = page.text?.content ? _htmlToPlain(page.text.content).trim() : undefined;
      break;
    }
  }

  const factionCtx: import("@lorebridge/shared/capabilities").FactionContextData = {
    journalId: journal.id!,
    journalName: journal.name!,
  };
  if (pageId) factionCtx.pageId = pageId;
  if (pageContent) factionCtx.pageContent = pageContent;
  if (factionProfile) factionCtx.currentFactionProfile = factionProfile;

  return {
    sourceId: (game.world?.id ?? "unknown") as string,
    sourceName: (game.world?.title ?? "Unknown World") as string,
    context: factionCtx,
  };
}

function _htmlToPlain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Approval payload types
// ---------------------------------------------------------------------------

export type NpcDossierApprovalPayload = {
  token: string;
  journalId: string;
  journalName: string;
  tab: "roleplay" | "overview" | "knowledge";
  proposedFields: Record<string, unknown>;
  rationale: string;
  expiresAt: string;
};

export type FactionProfileApprovalPayload = {
  token: string;
  journalId: string;
  journalName: string;
  pageId?: string;
  proposedPageContent?: string;
  proposedFactionProfile: Record<string, unknown>;
  rationale: string;
  expiresAt: string;
};

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function _backendPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  if (!settings.clientToken) throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This browser is not paired with the LoreBridge backend.");

  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl.slice(0, -1) : settings.backendUrl;
  const url = `${base}/${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.clientToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }

  if (response.status === 401 || response.status === 403) throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  if (response.status === 404) throw new LoreBridgeCapabilityError("NOT_FOUND", "Write token not found. It may have expired.");
  if (response.status === 410) throw new LoreBridgeCapabilityError("NOT_FOUND", "This write token has already been used or has expired.");
  if (!response.ok) {
    const body2 = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body2 as { error?: { message?: string } }).error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// NPC Dossier approve / reject
// ---------------------------------------------------------------------------

export async function rejectNpcDossierWrite(token: string): Promise<void> {
  requireFoundryGm("rejectNpcDossierWrite");
  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "rejectNpcDossierWrite requires a non-empty token.");
  }
  await _backendPost("v1/npc-dossier/reject", { token: token.trim() });
}

export async function approveNpcDossierWrite(token: string): Promise<void> {
  requireFoundryGm("approveNpcDossierWrite");
  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "approveNpcDossierWrite requires a non-empty token.");
  }

  const settings = getLoreBridgeSettings();
  if (!settings.writesEnabled) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "AI-proposed writes are disabled. Enable 'Enable AI-Proposed Writes' in LoreBridge world settings.");
  }

  const raw = await _backendPost("v1/npc-dossier/approve", { token: token.trim() });
  const validation = validateApproveNpcDossierResult(raw);
  if (!validation.valid || !validation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "The backend returned an invalid NPC dossier approve response.", {
      details: { validationErrors: validation.errors },
    });
  }

  await _applyNpcDossierWrite(validation.value);
}

async function _applyNpcDossierWrite(data: ApproveNpcDossierResult): Promise<void> {
  const { journalId, journalName, tab, proposedFields } = data;

  const journal = (game.journal as { get(id: string): JournalWithFlags | undefined }).get(journalId);
  if (!journal) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${journalId}' not found in the loaded world.`);
  }

  const existing = (journal.getFlag("lorebridge", "npcDossier") ?? {}) as Record<string, unknown>;
  // The knowledge tab's fields (conditionalInfo, qa, knowledge[], knowledgeLimits) live at the
  // npcDossier root in Campaign Codex's schema — not nested under a "knowledge" sub-key.
  let updatedDossier: Record<string, unknown>;
  if (tab === "knowledge") {
    updatedDossier = { ...existing, ...proposedFields };
  } else {
    const existingTab = (existing[tab] ?? {}) as Record<string, unknown>;
    const updatedTab = { ...existingTab, ...proposedFields };
    updatedDossier = { ...existing, [tab]: updatedTab };
  }

  await journal.setFlag("lorebridge", "npcDossier", updatedDossier);
  console.info(`LoreBridge | NPC dossier ${tab} tab updated for "${journalName}" (${journalId})`);
}

// ---------------------------------------------------------------------------
// Faction profile approve / reject
// ---------------------------------------------------------------------------

export async function rejectFactionProfileWrite(token: string): Promise<void> {
  requireFoundryGm("rejectFactionProfileWrite");
  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "rejectFactionProfileWrite requires a non-empty token.");
  }
  await _backendPost("v1/faction-profile/reject", { token: token.trim() });
}

export async function approveFactionProfileWrite(token: string): Promise<void> {
  requireFoundryGm("approveFactionProfileWrite");
  if (typeof token !== "string" || !token.trim()) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "approveFactionProfileWrite requires a non-empty token.");
  }

  const settings = getLoreBridgeSettings();
  if (!settings.writesEnabled) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "AI-proposed writes are disabled. Enable 'Enable AI-Proposed Writes' in LoreBridge world settings.");
  }

  const raw = await _backendPost("v1/faction-profile/approve", { token: token.trim() });
  const validation = validateApproveFactionProfileResult(raw);
  if (!validation.valid || !validation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "The backend returned an invalid faction profile approve response.", {
      details: { validationErrors: validation.errors },
    });
  }

  await _applyFactionProfileWrite(validation.value);
}

async function _applyFactionProfileWrite(data: ApproveFactionProfileResult): Promise<void> {
  const { journalId, journalName, pageId, proposedPageContent, proposedFactionProfile } = data;

  const journal = (game.journal as { get(id: string): JournalWithFlags | undefined }).get(journalId);
  if (!journal) {
    throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${journalId}' not found in the loaded world.`);
  }

  await journal.setFlag("lorebridge", "factionProfile", proposedFactionProfile);

  if (proposedPageContent && pageId && journal.pages) {
    for (const page of journal.pages) {
      if (page.id === pageId) {
        const pageDoc = (game as unknown as Record<string, unknown>)["journal"] as { get(id: string): { pages?: { get(id: string): { update(data: Record<string, unknown>): Promise<void> } | undefined } } | undefined };
        const j = pageDoc.get(journalId);
        const p = j?.pages?.get(pageId);
        if (p) {
          await p.update({ "text.content": proposedPageContent });
        }
        break;
      }
    }
  }

  console.info(`LoreBridge | Faction profile updated for "${journalName}" (${journalId})`);
}

// ---------------------------------------------------------------------------
// NPC Dossier approval UI
// ---------------------------------------------------------------------------

const _pendingNpcDossierProposals = new Map<string, NpcDossierApprovalPayload>();
let _npcDossierPanel: NpcDossierBatchPanel | null = null;

function _escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _escAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function _buildNpcDossierPanelHtml(proposals: NpcDossierApprovalPayload[]): string {
  if (proposals.length === 0) {
    return `<p style="color:#888;text-align:center;padding:16px 0;">No pending NPC dossier proposals.</p>`;
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
    const tabLabel = p.tab.charAt(0).toUpperCase() + p.tab.slice(1);
    const fieldSummary = Object.keys(p.proposedFields).map(k => _escHtml(k)).join(", ");
    return `
      <div style="border:1px solid #444;border-radius:4px;padding:10px;margin-bottom:8px;">
        <div style="font-weight:bold;margin-bottom:4px;">
          <i class="fas fa-user" style="color:#c9a84c;margin-right:4px;"></i>${_escHtml(p.journalName)} — ${tabLabel} Tab
        </div>
        <div style="margin-bottom:4px;font-size:0.88em;color:#aaa;">Fields: ${fieldSummary}</div>
        <div style="margin-bottom:6px;font-size:0.85em;color:#888;">${_escHtml(p.rationale)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.75em;color:#666;">Expires ${expiresStr}</span>
          <div style="display:flex;gap:6px;">
            <button data-action="reject" data-token="${_escAttr(p.token)}"
              style="padding:4px 12px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a;border-radius:3px;cursor:pointer;">
              <i class="fas fa-times"></i> Reject
            </button>
            <button data-action="approve" data-token="${_escAttr(p.token)}"
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

class NpcDossierBatchPanel extends ApprovalQueuePanel {
  static override DEFAULT_OPTIONS = {
    id: "lorebridge-npc-dossier-approval",
    classes: ["lorebridge-approval-queue", "lorebridge-npc-dossier-approval"],
    window: { title: "LoreBridge — NPC Dossier Proposals", resizable: true },
    position: { width: 580, height: 500 },
  };

  protected override renderApprovalQueueHtml(): string {
    return _buildNpcDossierPanelHtml(Array.from(_pendingNpcDossierProposals.values()));
  }

  override _onClickAction(_event: PointerEvent, target: HTMLElement): void | Promise<void> {
    const action = target.dataset.action;
    const token = target.dataset.token ?? "";
    if (action === "approve") return _doNpcDossierApprove(token, this);
    if (action === "reject") return _doNpcDossierReject(token, this);
    if (action === "approve-all") return _doNpcDossierApproveAll(this);
    if (action === "reject-all") return _doNpcDossierRejectAll(this);
  }
}

async function _doNpcDossierApprove(token: string, panel: NpcDossierBatchPanel): Promise<void> {
  const proposal = _pendingNpcDossierProposals.get(token);
  if (!proposal) return;
  _pendingNpcDossierProposals.delete(token);
  try {
    await approveNpcDossierWrite(token);
    ui.notifications.info(`LoreBridge: NPC dossier updated for "${proposal.journalName}".`);
  } catch (err: unknown) {
    _pendingNpcDossierProposals.set(token, proposal);
    ui.notifications.error(`LoreBridge: Approve failed — ${err instanceof Error ? err.message : String(err)}`);
  }
  await _refreshOrCloseNpcDossier(panel);
}

async function _doNpcDossierReject(token: string, panel: NpcDossierBatchPanel): Promise<void> {
  const proposal = _pendingNpcDossierProposals.get(token);
  if (!proposal) return;
  _pendingNpcDossierProposals.delete(token);
  try {
    await rejectNpcDossierWrite(token);
    ui.notifications.info("LoreBridge: NPC dossier proposal rejected.");
  } catch (err: unknown) {
    _pendingNpcDossierProposals.set(token, proposal);
    ui.notifications.error(`LoreBridge: Reject failed — ${err instanceof Error ? err.message : String(err)}`);
  }
  await _refreshOrCloseNpcDossier(panel);
}

async function _doNpcDossierApproveAll(panel: NpcDossierBatchPanel): Promise<void> {
  const tokens = Array.from(_pendingNpcDossierProposals.keys());
  for (const token of tokens) await _doNpcDossierApprove(token, panel);
}

async function _doNpcDossierRejectAll(panel: NpcDossierBatchPanel): Promise<void> {
  const tokens = Array.from(_pendingNpcDossierProposals.keys());
  for (const token of tokens) await _doNpcDossierReject(token, panel);
}

async function _refreshOrCloseNpcDossier(panel: NpcDossierBatchPanel): Promise<void> {
  if (_pendingNpcDossierProposals.size === 0) {
    await panel.close();
    _npcDossierPanel = null;
  } else {
    await panel.render({ force: true });
  }
}

export async function showNpcDossierApprovalDialog(payload: NpcDossierApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;
  _pendingNpcDossierProposals.set(payload.token, payload);
  if (!_npcDossierPanel || !_npcDossierPanel.rendered) {
    _npcDossierPanel = new NpcDossierBatchPanel();
    await _npcDossierPanel.render({ force: true });
  } else {
    await _npcDossierPanel.render({ force: true });
    _npcDossierPanel.bringToFront();
  }
}

// ---------------------------------------------------------------------------
// Faction profile approval UI
// ---------------------------------------------------------------------------

const _pendingFactionProfileProposals = new Map<string, FactionProfileApprovalPayload>();
let _factionProfilePanel: FactionProfileBatchPanel | null = null;

function _buildFactionProfilePanelHtml(proposals: FactionProfileApprovalPayload[]): string {
  if (proposals.length === 0) {
    return `<p style="color:#888;text-align:center;padding:16px 0;">No pending faction profile proposals.</p>`;
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
          <i class="fas fa-shield-alt" style="color:#c9a84c;margin-right:4px;"></i>${_escHtml(p.journalName)} — Faction Profile
        </div>
        <div style="margin-bottom:6px;font-size:0.85em;color:#888;">${_escHtml(p.rationale)}</div>
        ${p.proposedPageContent ? `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#aaa;font-size:0.82em;">Show overview text</summary><div style="max-height:150px;overflow-y:auto;border:1px solid #333;border-radius:3px;margin-top:6px;padding:4px 8px;background:#111;font-size:0.85em;">${_escHtml(p.proposedPageContent.slice(0, 500))}</div></details>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.75em;color:#666;">Expires ${expiresStr}</span>
          <div style="display:flex;gap:6px;">
            <button data-action="reject" data-token="${_escAttr(p.token)}"
              style="padding:4px 12px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a;border-radius:3px;cursor:pointer;">
              <i class="fas fa-times"></i> Reject
            </button>
            <button data-action="approve" data-token="${_escAttr(p.token)}"
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

class FactionProfileBatchPanel extends ApprovalQueuePanel {
  static override DEFAULT_OPTIONS = {
    id: "lorebridge-faction-profile-approval",
    classes: ["lorebridge-approval-queue", "lorebridge-faction-profile-approval"],
    window: { title: "LoreBridge — Faction Profile Proposals", resizable: true },
    position: { width: 580, height: 480 },
  };

  protected override renderApprovalQueueHtml(): string {
    return _buildFactionProfilePanelHtml(Array.from(_pendingFactionProfileProposals.values()));
  }

  override _onClickAction(_event: PointerEvent, target: HTMLElement): void | Promise<void> {
    const action = target.dataset.action;
    const token = target.dataset.token ?? "";
    if (action === "approve") return _doFactionApprove(token, this);
    if (action === "reject") return _doFactionReject(token, this);
    if (action === "approve-all") return _doFactionApproveAll(this);
    if (action === "reject-all") return _doFactionRejectAll(this);
  }
}

async function _doFactionApprove(token: string, panel: FactionProfileBatchPanel): Promise<void> {
  const proposal = _pendingFactionProfileProposals.get(token);
  if (!proposal) return;
  _pendingFactionProfileProposals.delete(token);
  try {
    await approveFactionProfileWrite(token);
    ui.notifications.info(`LoreBridge: Faction profile updated for "${proposal.journalName}".`);
  } catch (err: unknown) {
    _pendingFactionProfileProposals.set(token, proposal);
    ui.notifications.error(`LoreBridge: Approve failed — ${err instanceof Error ? err.message : String(err)}`);
  }
  await _refreshOrCloseFaction(panel);
}

async function _doFactionReject(token: string, panel: FactionProfileBatchPanel): Promise<void> {
  const proposal = _pendingFactionProfileProposals.get(token);
  if (!proposal) return;
  _pendingFactionProfileProposals.delete(token);
  try {
    await rejectFactionProfileWrite(token);
    ui.notifications.info("LoreBridge: Faction profile proposal rejected.");
  } catch (err: unknown) {
    _pendingFactionProfileProposals.set(token, proposal);
    ui.notifications.error(`LoreBridge: Reject failed — ${err instanceof Error ? err.message : String(err)}`);
  }
  await _refreshOrCloseFaction(panel);
}

async function _doFactionApproveAll(panel: FactionProfileBatchPanel): Promise<void> {
  const tokens = Array.from(_pendingFactionProfileProposals.keys());
  for (const token of tokens) await _doFactionApprove(token, panel);
}

async function _doFactionRejectAll(panel: FactionProfileBatchPanel): Promise<void> {
  const tokens = Array.from(_pendingFactionProfileProposals.keys());
  for (const token of tokens) await _doFactionReject(token, panel);
}

async function _refreshOrCloseFaction(panel: FactionProfileBatchPanel): Promise<void> {
  if (_pendingFactionProfileProposals.size === 0) {
    await panel.close();
    _factionProfilePanel = null;
  } else {
    await panel.render({ force: true });
  }
}

export async function showFactionProfileApprovalDialog(payload: FactionProfileApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;
  _pendingFactionProfileProposals.set(payload.token, payload);
  if (!_factionProfilePanel || !_factionProfilePanel.rendered) {
    _factionProfilePanel = new FactionProfileBatchPanel();
    await _factionProfilePanel.render({ force: true });
  } else {
    await _factionProfilePanel.render({ force: true });
    _factionProfilePanel.bringToFront();
  }
}
