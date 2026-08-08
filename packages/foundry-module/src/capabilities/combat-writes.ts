import {
  COMBAT_WRITE_TEST_ACTION,
  validateCombatWriteAuditResult,
  validateCombatWriteProposal,
  validateExecuteCombatWriteInput,
  type CombatWriteApprovalPayload,
  type CombatWriteAuditResult,
  type CombatWriteProposal,
  type CombatWriteProposalResult,
  type CombatWriteSnapshot,
  type ExecuteCombatWriteInput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";

type HttpErrorBody = { error?: { message?: string } };
type FoundryCombatWriteApprovalPayload = CombatWriteApprovalPayload & { approvalProof: string };
const pending = new Map<string, FoundryCombatWriteApprovalPayload>();
const approvalProofs = new Map<string, string>();
let panel: CombatWriteApprovalPanel | null = null;

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function captureCombatWriteSnapshot(): CombatWriteSnapshot {
  requireFoundryGm("captureCombatWriteSnapshot");
  const combat = game.combats?.active;
  if (!combat || !combat.active || !combat.started) throw new LoreBridgeCapabilityError("NOT_FOUND", "There is no active, started combat to snapshot.");
  const round = combat.current.round;
  const turn = combat.current.turn;
  if (!Number.isInteger(round) || (round as number) < 0 || !Number.isInteger(turn) || (turn as number) < 0) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "The active combat does not have a valid round and turn.");
  const combatUuid = combat.uuid;
  if (!combatUuid) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "The active combat does not have a stable UUID.");
  const combatants = combat.turns.slice(0, 200).map((entry) => ({ id: entry.id, initiative: typeof entry.initiative === "number" ? entry.initiative : null }));
  const base = {
    combatUuid, combatName: combat.name || "Active Combat",
    ...(combat.scene?.id ? { sceneId: combat.scene.id } : {}),
    round: round as number, turn: turn as number,
    ...(combat.combatant?.id ? { currentCombatantId: combat.combatant.id } : {}),
    combatants,
  };
  return { ...base, fingerprint: fingerprint(JSON.stringify(base)) };
}

function assertConfigured(): ReturnType<typeof getLoreBridgeSettings> {
  requireFoundryGm("combatWrite");
  const settings = getLoreBridgeSettings();
  if (!settings.combatWritesEnabled) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "Controlled combat writes are disabled. Enable them in LoreBridge Feature Settings.");
  if (!settings.backendUrl) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  if (!settings.clientToken) throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This GM browser is not paired with the LoreBridge backend.");
  return settings;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const settings = assertConfigured();
  const url = `${settings.backendUrl.replace(/\/$/, "")}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${settings.clientToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }
  const result = await response.json().catch(() => ({})) as T & HttpErrorBody;
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "NOT_AUTHORIZED" : response.status === 404 || response.status === 410 ? "NOT_FOUND" : response.status === 400 ? "INVALID_REQUEST" : "INTERNAL_ERROR";
    throw new LoreBridgeCapabilityError(code, result.error?.message ?? `Backend returned ${response.status}.`);
  }
  return result;
}

/** Foundation-only synthetic proposal. It proves approval and conflict handling without mutating combat. */
export async function proposeCombatWriteTest(options: { ttlMs?: number } = {}): Promise<CombatWriteProposalResult> {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  const snapshot = captureCombatWriteSnapshot();
  const proposal: CombatWriteProposal = {
    action: COMBAT_WRITE_TEST_ACTION,
    combatUuid: snapshot.combatUuid,
    expectedRound: snapshot.round,
    expectedTurn: snapshot.turn,
    target: { combatUuid: snapshot.combatUuid },
    parameters: {},
    rationale: "Verify the controlled combat-write approval and stale-state safeguards without changing combat.",
    beforeSummary: `${snapshot.combatName}: round ${snapshot.round}, turn ${snapshot.turn}, ${snapshot.combatants.length} combatants.`,
    afterSummary: "No mutation. The synthetic handler records approval only when the captured combat state is unchanged.",
    snapshot,
  };
  const validation = validateCombatWriteProposal(proposal);
  if (!validation.valid) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Synthetic combat proposal is invalid.", { details: { validationErrors: validation.errors } });
  const ttlMs = options.ttlMs === undefined ? undefined : Math.max(1, Math.min(Math.trunc(options.ttlMs), 60_000));
  const approvalProof = crypto.randomUUID();
  return post<CombatWriteProposalResult>("/v1/combat-write/propose-test", { proposal, sourceId: `foundry:${game.world.id}`, approvalProof, ...(ttlMs === undefined ? {} : { ttlMs }) });
}

export function executeCombatWrite(input: ExecuteCombatWriteInput): CombatWriteAuditResult {
  assertConfigured();
  const validation = validateExecuteCombatWriteInput(input);
  if (!validation.valid || !validation.value) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Combat-write execution input is invalid.", { details: { validationErrors: validation.errors } });
  const proposal = validation.value.proposal;
  let current: CombatWriteSnapshot;
  try {
    current = captureCombatWriteSnapshot();
  } catch (error) {
    if (error instanceof LoreBridgeCapabilityError && (error.code === "NOT_FOUND" || error.code === "INVALID_REQUEST")) {
      return { action: proposal.action, target: proposal.target, outcome: "stale", occurredAt: new Date().toISOString(), summary: "The previewed active combat no longer exists in the expected state. No mutation was attempted." };
    }
    throw error;
  }
  if (current.fingerprint !== proposal.snapshot.fingerprint || current.combatUuid !== proposal.combatUuid) {
    return { action: proposal.action, target: proposal.target, outcome: "stale", occurredAt: new Date().toISOString(), summary: "The active combat changed after preview. No mutation was attempted.", stateFingerprint: current.fingerprint };
  }
  return { action: proposal.action, target: proposal.target, outcome: "approved", occurredAt: new Date().toISOString(), summary: "Synthetic combat-write approval reached the action handler with an unchanged snapshot. No mutation was performed.", stateFingerprint: current.fingerprint };
}

export async function approveCombatWrite(token: string): Promise<CombatWriteAuditResult> {
  const normalizedToken = token.trim();
  const approvalProof = approvalProofs.get(normalizedToken) ?? "";
  const result = await post<CombatWriteAuditResult>("/v1/combat-write/approve", { token: normalizedToken, approvalProof });
  const validation = validateCombatWriteAuditResult(result);
  if (!validation.valid || !validation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Backend returned an invalid combat-write audit result.");
  return validation.value;
}

export async function rejectCombatWrite(token: string): Promise<CombatWriteAuditResult> {
  const normalizedToken = token.trim();
  const approvalProof = approvalProofs.get(normalizedToken) ?? "";
  const result = await post<CombatWriteAuditResult>("/v1/combat-write/reject", { token: normalizedToken, approvalProof });
  const validation = validateCombatWriteAuditResult(result);
  if (!validation.valid || !validation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Backend returned an invalid combat-write audit result.");
  return validation.value;
}

export function notifyCombatWriteResult(result: CombatWriteAuditResult): void {
  const message = `LoreBridge combat write: ${result.summary}`;
  if (result.outcome === "stale") ui.notifications.warn(message);
  else ui.notifications.info(message);
}

function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function renderProposal(value: FoundryCombatWriteApprovalPayload): string {
  const expiry = new Date(value.expiresAt).toLocaleTimeString();
  return `<section class="lb-combat-approval" data-token="${escapeHtml(value.token)}">
    <header><strong>Safety Test — ${escapeHtml(value.snapshot.combatName)}</strong><span>Expires ${escapeHtml(expiry)}</span></header>
    <div class="lb-combat-approval__body">
      <p><strong>Target:</strong> ${escapeHtml(value.combatUuid)}</p>
      <p><strong>Expected state:</strong> Round ${value.expectedRound}, turn ${value.expectedTurn}, ${value.snapshot.combatants.length} combatants</p>
      <div class="lb-combat-approval__change"><div><strong>Before</strong><p>${escapeHtml(value.beforeSummary)}</p></div><div><strong>After</strong><p>${escapeHtml(value.afterSummary)}</p></div></div>
      <p class="hint">${escapeHtml(value.rationale)}</p>
    </div>
    <footer><button type="button" data-action="reject" data-token="${escapeHtml(value.token)}"><i class="fas fa-times"></i> Reject</button><button type="button" data-action="approve" data-token="${escapeHtml(value.token)}"><i class="fas fa-check"></i> Approve Once</button></footer>
  </section>`;
}

const AppBase = foundry.applications.api.ApplicationV2;
class CombatWriteApprovalPanel extends AppBase {
  static override DEFAULT_OPTIONS = { id: "lorebridge-combat-write-approval", classes: ["lorebridge-combat-write-approval"], window: { title: "LoreBridge — Combat Approval", resizable: true }, position: { width: 560, height: 460 } };
  override async _renderHTML(): Promise<HTMLElement> { const root = document.createElement("div"); root.className = "lb-combat-approval-list"; root.innerHTML = [...pending.values()].map(renderProposal).join("") || "<p>No pending combat proposals.</p>"; return root; }
  override _replaceHTML(result: HTMLElement, content: HTMLElement): void { content.replaceChildren(...Array.from(result.childNodes)); }
  override _onClickAction(_event: PointerEvent, target: HTMLElement): void { const token = target.dataset.token; if (!token) return; if (target.dataset.action === "approve") void finish(token, true, this); if (target.dataset.action === "reject") void finish(token, false, this); }
}

async function finish(token: string, approve: boolean, app: CombatWriteApprovalPanel): Promise<void> {
  const proposal = pending.get(token); if (!proposal) return;
  try {
    const result = approve ? await approveCombatWrite(token) : await rejectCombatWrite(token);
    notifyCombatWriteResult(result);
  } catch (error) {
    ui.notifications.error(`LoreBridge combat approval failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  pending.delete(token);
  if (pending.size === 0) { await app.close(); panel = null; } else await app.render({ force: true });
}

export async function showCombatWriteApproval(payload: FoundryCombatWriteApprovalPayload): Promise<void> {
  if (!game.user?.isGM || !getLoreBridgeSettings().combatWritesEnabled) return;
  const validation = validateCombatWriteProposal(payload);
  if (!validation.valid || typeof payload.token !== "string" || typeof payload.approvalProof !== "string" || !payload.approvalProof || Number.isNaN(Date.parse(payload.expiresAt))) return;
  pending.set(payload.token, payload);
  approvalProofs.set(payload.token, payload.approvalProof);
  const remainingMs = Math.max(0, Date.parse(payload.expiresAt) - Date.now());
  setTimeout(() => approvalProofs.delete(payload.token), remainingMs + 5_000);
  if (!panel || !panel.rendered) { panel = new CombatWriteApprovalPanel(); await panel.render({ force: true }); }
  else { await panel.render({ force: true }); panel.bringToFront(); }
}
