import { type CampaignCodexWriteOperation, type CampaignCodexWritePreview, PREVIEW_CAMPAIGN_CODEX_WRITE_CAPABILITY } from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";
import { type JournalWithOps } from "./tracker-shared.js";
import { ApprovalQueuePanel } from "../approval-queue-panel.js";

export type CampaignCodexWriteApprovalPayload = CampaignCodexWritePreview & { token: string; rationale: string; expiresAt: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pending = new Map<string, CampaignCodexWriteApprovalPayload>();
let panel: CampaignCodexWriteApprovalPanel | null = null;
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return `fnv1a-${(h >>> 0).toString(16)}`; };
const journal = (id?: string): JournalWithOps => { const value = game.journal.get(String(id ?? "")); if (!value) throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal '${id}' was not found.`); return value as unknown as JournalWithOps; };
const folder = (id?: string) => { const value = game.folders.get(String(id ?? "")); if (!value || value.type !== "JournalEntry") throw new LoreBridgeCapabilityError("NOT_FOUND", `Journal folder '${id}' was not found.`); return value; };
function requireCc(entry: JournalWithOps, type?: string): Record<string, unknown> {
  const data = entry.getFlag("campaign-codex", "data") as Record<string, unknown> | undefined;
  if (!data || (type && entry.getFlag("campaign-codex", "type") !== type)) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", `Journal '${entry.name}' is not the required Campaign Codex record.`);
  return data;
}
export function previewCampaignCodexWrite(operation: CampaignCodexWriteOperation): CampaignCodexWritePreview {
  requireFoundryGm(PREVIEW_CAMPAIGN_CODEX_WRITE_CAPABILITY);
  if (!game.modules.get("campaign-codex")?.active) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "Campaign Codex must be active.");
  let beforeSummary = ""; let afterSummary = ""; let fingerprintSource = "";
  switch (operation.action) {
    case "create_folder": { const parent = operation.parentFolderId ? folder(operation.parentFolderId) : null; if (!operation.name?.trim()) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "name is required."); beforeSummary = parent ? `Folder ${parent.name}.` : "Create a top-level journal folder."; afterSummary = `Create JournalEntry folder '${operation.name.trim()}'.`; fingerprintSource = `${parent?.id ?? "root"}:${operation.name.trim()}`; break; }
    case "rename_folder": { const target = folder(operation.folderId); if (!operation.newName?.trim()) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "newName is required."); beforeSummary = `Folder '${target.name}'.`; afterSummary = `Rename folder to '${operation.newName.trim()}'.`; fingerprintSource = `${target.id}:${target.name}`; break; }
    case "move_record": { const target = journal(operation.documentId); const destination = operation.targetFolderId ? folder(operation.targetFolderId) : null; beforeSummary = `'${target.name}' is in ${target.folder?.name ?? "no folder"}.`; afterSummary = `Move '${target.name}' to ${destination?.name ?? "no folder"}.`; fingerprintSource = `${target.id}:${target.folder?.id ?? "root"}`; break; }
    case "rename_record": { const target = journal(operation.documentId); if (!operation.newName?.trim()) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "newName is required."); beforeSummary = `Journal '${target.name}'.`; afterSummary = `Rename journal to '${operation.newName.trim()}'.`; fingerprintSource = `${target.id}:${target.name}`; break; }
    case "set_location_marker": { const target = journal(operation.locationId); requireCc(target, "location"); const scene = game.scenes.get(String(operation.sceneId)); if (!scene || !Number.isFinite(operation.x) || !Number.isFinite(operation.y)) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "A world scene and finite x/y coordinates are required."); const existing = Array.from(scene.notes).filter((note: any) => note.entryId === target.id); beforeSummary = `'${target.name}' has ${existing.length} marker(s) on '${scene.name}'.`; afterSummary = `Create a marker at (${operation.x}, ${operation.y}) on '${scene.name}'.`; fingerprintSource = `${target.uuid}:${scene.uuid}:${existing.map((note: any) => `${note.id}:${note.x}:${note.y}`).join("|")}`; break; }
    case "update_relationship": { const source = journal(operation.sourceId); const target = journal(operation.targetId); requireCc(source, "location"); requireCc(target, "region"); const sourceData = requireCc(source); const targetData = requireCc(target); beforeSummary = `Location '${source.name}' parent: ${String(sourceData.parentRegion ?? "none")}; Region '${target.name}' locations: ${Array.isArray(targetData.linkedLocations) ? targetData.linkedLocations.length : 0}.`; afterSummary = `Link '${source.name}' to Region '${target.name}'.`; fingerprintSource = `${source.uuid}:${String(sourceData.parentRegion ?? "")}:${target.uuid}:${JSON.stringify(targetData.linkedLocations ?? [])}`; break; }
    default: throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Unsupported Campaign Codex operation.");
  }
  return { operation, beforeSummary, afterSummary, fingerprint: hash(fingerprintSource), sourceId: game.world?.id ?? "unknown", sourceName: game.world?.title ?? "Unknown World" };
}
async function post(path: string, token: string): Promise<CampaignCodexWriteApprovalPayload> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend pairing is required.");
  const sourceId = game.world?.id ?? "unknown";
  const response = await fetch(`${settings.backendUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers: { authorization: `Bearer ${settings.clientToken}`, "content-type": "application/json" }, body: JSON.stringify({ token, sourceId }) });
  const body = await response.json().catch(() => ({})); if (!response.ok) throw new LoreBridgeCapabilityError(response.status === 410 ? "NOT_FOUND" : "INTERNAL_ERROR", (body as { error?: { message?: string } }).error?.message ?? "Campaign Codex approval failed."); return body as CampaignCodexWriteApprovalPayload;
}
export async function approveCampaignCodexWrite(token: string): Promise<void> { requireFoundryGm("approveCampaignCodexWrite"); if (!getLoreBridgeSettings().writesEnabled) throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "Enable AI-Proposed Writes first."); const proposal = await post("/v1/cc-write/approve", token); const current = previewCampaignCodexWrite(proposal.operation); if (current.fingerprint !== proposal.fingerprint) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "The Campaign Codex record changed after preview; no write was made."); const op = proposal.operation;
  if (op.action === "create_folder") await Folder.create({ name: op.name!.trim(), type: "JournalEntry", folder: op.parentFolderId ?? null });
  else if (op.action === "rename_folder") await (folder(op.folderId) as any).update({ name: op.newName!.trim() });
  else if (op.action === "move_record") await (journal(op.documentId) as any).update({ folder: op.targetFolderId ?? null });
  else if (op.action === "rename_record") await (journal(op.documentId) as any).update({ name: op.newName!.trim() });
  else if (op.action === "set_location_marker") { const entry = journal(op.locationId); const scene = game.scenes.get(op.sceneId!)!; await (scene as any).createEmbeddedDocuments("Note", [{ entryId: entry.id, x: op.x!, y: op.y!, icon: "icons/svg/book.svg", text: entry.name }]); }
  else { const location = journal(op.sourceId); const region = journal(op.targetId); const locationData = requireCc(location); const regionData = requireCc(region); for (const candidate of Array.from(game.journal).map(value => value as unknown as JournalWithOps)) { if (candidate.getFlag("campaign-codex", "type") !== "region") continue; const data = requireCc(candidate); if (Array.isArray(data.linkedLocations) && candidate.id !== region.id) { data.linkedLocations = data.linkedLocations.filter(uuid => uuid !== location.uuid); await candidate.setFlag("campaign-codex", "data", data); } } regionData.linkedLocations = [...new Set([...(Array.isArray(regionData.linkedLocations) ? regionData.linkedLocations as string[] : []), location.uuid])]; locationData.parentRegion = region.uuid; await region.setFlag("campaign-codex", "data", regionData); await location.setFlag("campaign-codex", "data", locationData); }
}
export async function rejectCampaignCodexWrite(token: string): Promise<void> { requireFoundryGm("rejectCampaignCodexWrite"); await post("/v1/cc-write/reject", token); }

function renderProposal(payload: CampaignCodexWriteApprovalPayload): string {
  return `<section class="lb-combat-approval" data-token="${esc(payload.token)}">
    <header><strong>Campaign Codex — ${esc(payload.operation.action.replaceAll("_", " "))}</strong><span>Expires ${esc(new Date(payload.expiresAt).toLocaleTimeString())}</span></header>
    <div class="lb-combat-approval__body">
      <div class="lb-combat-approval__change"><div><strong>Before</strong><p>${esc(payload.beforeSummary)}</p></div><div><strong>After</strong><p>${esc(payload.afterSummary)}</p></div></div>
      <p class="hint">${esc(payload.rationale)}</p>
    </div>
    <footer><button type="button" data-action="reject" data-token="${esc(payload.token)}" style="padding:4px 12px;background:#3a1a1a;color:#cf6f6f;border:1px solid #6a3a3a;border-radius:3px;cursor:pointer;"><i class="fas fa-times"></i> Reject</button><button type="button" data-action="approve" data-token="${esc(payload.token)}" style="padding:4px 12px;background:#1a3a1a;color:#6fcf6f;border:1px solid #3a6a3a;border-radius:3px;cursor:pointer;"><i class="fas fa-check"></i> Approve Once</button></footer>
  </section>`;
}

class CampaignCodexWriteApprovalPanel extends ApprovalQueuePanel {
  static override DEFAULT_OPTIONS = { id: "lorebridge-campaign-codex-write-approval", classes: ["lorebridge-approval-queue", "lorebridge-campaign-codex-write-approval"], window: { title: "LoreBridge — Campaign Codex Approval", resizable: true }, position: { width: 560, height: 460 } };
  protected override renderApprovalQueueHtml(): string { return [...pending.values()].map(renderProposal).join("") || "<p>No pending Campaign Codex proposals.</p>"; }
  override _onClickAction(_event: PointerEvent, target: HTMLElement): void { const token = target.dataset.token; if (!token) return; if (target.dataset.action === "approve") void finish(token, true, this); if (target.dataset.action === "reject") void finish(token, false, this); }
}

async function finish(token: string, approved: boolean, app: CampaignCodexWriteApprovalPanel): Promise<void> {
  const proposal = pending.get(token); if (!proposal) return;
  try {
    if (approved) await approveCampaignCodexWrite(token);
    else await rejectCampaignCodexWrite(token);
    pending.delete(token);
    ui.notifications.info(approved ? "LoreBridge: Campaign Codex write approved and applied." : "LoreBridge: Campaign Codex proposal rejected.");
  } catch (error) {
    ui.notifications.error(`LoreBridge: Campaign Codex approval failed — ${error instanceof Error ? error.message : String(error)}`);
  }
  if (pending.size === 0) { await app.close(); panel = null; } else await app.render({ force: true });
}

export async function showCampaignCodexWriteApproval(payload: CampaignCodexWriteApprovalPayload): Promise<void> {
  if (!game.user?.isGM || !payload.token || Number.isNaN(Date.parse(payload.expiresAt))) return;
  const worldId = game.world?.id ?? "unknown";
  if (payload.sourceId && payload.sourceId !== "unknown" && payload.sourceId !== worldId) return;
  pending.set(payload.token, payload);
  if (!panel || !panel.rendered) { panel = new CampaignCodexWriteApprovalPanel(); await panel.render({ force: true }); }
  else { await panel.render({ force: true }); panel.bringToFront(); }
}
