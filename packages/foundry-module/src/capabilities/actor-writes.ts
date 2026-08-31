import type { ActorCreateApprovalPayload, ActorUpdateApprovalPayload } from "@lorebridge/shared/capabilities";
import { buildDnd5eActorData, buildEmbeddedItems, buildPreviewHtml, type NpcStatBlockResult, type RulesEdition } from "./npc-statblock.js";

// ---------------------------------------------------------------------------
// Actor create approval dialog
// ---------------------------------------------------------------------------

export async function showActorCreateApprovalDialog(payload: ActorCreateApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const stat = payload.npcStatBlock as unknown as NpcStatBlockResult;
  const edition = payload.edition;
  const folderId = payload.folderId;

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);

  const whisperContent = `
    <p><strong>LoreBridge — Actor Creation Proposal</strong></p>
    <p><strong>NPC:</strong> ${stat.name}</p>
    <p><strong>CR:</strong> ${stat.cr} | <strong>Type:</strong> ${stat.creatureType}</p>
    ${payload.rationale ? `<p><strong>Reason:</strong> ${payload.rationale}</p>` : ""}
    <p style="font-size:0.8em;color:#888;">Respond via the popup dialog.</p>
  `;

  await ChatMessage.create({
    content: whisperContent,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  const dialogContent = `
    <div>
      <p><strong>NPC:</strong> ${stat.name} (CR ${stat.cr}, ${stat.creatureType})</p>
      ${payload.rationale ? `<p><strong>Reason:</strong> ${payload.rationale}</p>` : ""}
      <details open style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">Stat Block Preview</summary>
        <div style="max-height:350px;overflow-y:auto;margin-top:4px;">
          ${buildPreviewHtml(stat)}
        </div>
      </details>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: `LoreBridge — Create Actor: ${stat.name}`, resizable: true },
    position: { width: 560, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "approve",
        label: "Create Actor",
        icon: "fas fa-user-plus",
        callback: () => {
          void (async () => {
            try {
              let folder: FoundryFolderDocument | undefined;
              if (folderId) {
                folder = game.folders?.get(folderId) as FoundryFolderDocument | undefined;
              }
              if (!folder) {
                for (const f of game.folders) {
                  if (f.type === "Actor" && f.name === "LoreBridge NPCs") { folder = f; break; }
                }
                if (!folder) {
                  folder = await Folder.create({ name: "LoreBridge NPCs", type: "Actor" });
                }
              }

              const actorData: Record<string, unknown> = {
                ...buildDnd5eActorData(stat, edition),
                folder: folder?.id ?? null,
                items: await buildEmbeddedItems(stat, edition),
              };

              const actor = await Actor.create(actorData);
              if (!actor) {
                ui.notifications.error("LoreBridge: Actor creation returned no document.");
                return;
              }
              ui.notifications.info(`LoreBridge: Created NPC actor "${actor.name}".`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              ui.notifications.error(`LoreBridge: Actor creation failed — ${msg}`);
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
          ui.notifications.info("LoreBridge: Actor creation proposal rejected.");
        },
      },
    ],
  }).render({ force: true });
}

// ---------------------------------------------------------------------------
// Actor update approval dialog
// ---------------------------------------------------------------------------

export async function showActorUpdateApprovalDialog(payload: ActorUpdateApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const stat = payload.npcStatBlock as unknown as NpcStatBlockResult;
  const edition = payload.edition;
  const actorId = payload.actorId;

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);

  const whisperContent = `
    <p><strong>LoreBridge — Actor Update Proposal</strong></p>
    <p><strong>Actor:</strong> ${payload.actorName}</p>
    ${payload.rationale ? `<p><strong>Instruction:</strong> ${payload.rationale}</p>` : ""}
    <p style="font-size:0.8em;color:#888;">Respond via the popup dialog.</p>
  `;

  await ChatMessage.create({
    content: whisperContent,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  const dialogContent = `
    <div>
      <p><strong>Updating actor:</strong> ${payload.actorName} → ${stat.name}</p>
      ${payload.rationale ? `<p><strong>Instruction:</strong> ${payload.rationale}</p>` : ""}
      <details open style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">Proposed Stat Block</summary>
        <div style="max-height:350px;overflow-y:auto;margin-top:4px;">
          ${buildPreviewHtml(stat)}
        </div>
      </details>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: `LoreBridge — Update Actor: ${payload.actorName}`, resizable: true },
    position: { width: 560, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "approve",
        label: "Apply Update",
        icon: "fas fa-save",
        callback: () => {
          void (async () => {
            try {
              const actor = game.actors?.get(actorId);
              if (!actor) {
                ui.notifications.error(`LoreBridge: Actor "${actorId}" not found.`);
                return;
              }

              const systemData = buildDnd5eActorData(stat, edition);
              await actor.update(systemData);

              const newItems = await buildEmbeddedItems(stat, edition);
              if (newItems.length > 0) {
                const existingItems = [...actor.items];
                if (existingItems.length > 0) {
                  const ids = existingItems.map((i) => i.id).filter(Boolean) as string[];
                  await actor.deleteEmbeddedDocuments("Item", ids);
                }
                await actor.createEmbeddedDocuments("Item", newItems);
              }

              ui.notifications.info(`LoreBridge: Updated actor "${actor.name}".`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              ui.notifications.error(`LoreBridge: Actor update failed — ${msg}`);
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
          ui.notifications.info("LoreBridge: Actor update proposal rejected.");
        },
      },
    ],
  }).render({ force: true });
}
