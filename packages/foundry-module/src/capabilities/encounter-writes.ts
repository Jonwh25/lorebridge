import type { EncounterCreateApprovalPayload, EncounterCombatant, SceneUpdateApprovalPayload } from "@lorebridge/shared/capabilities";

// ---------------------------------------------------------------------------
// Zone → canvas position mapping
// ---------------------------------------------------------------------------

type ZoneName = "north" | "south" | "east" | "west" | "center"
  | "northeast" | "northwest" | "southeast" | "southwest" | "random";

const ZONE_FRACTIONS: Record<ZoneName, [number, number]> = {
  center:    [0.50, 0.50],
  north:     [0.50, 0.15],
  south:     [0.50, 0.85],
  east:      [0.85, 0.50],
  west:      [0.15, 0.50],
  northeast: [0.75, 0.25],
  northwest: [0.25, 0.25],
  southeast: [0.75, 0.75],
  southwest: [0.25, 0.75],
  random:    [0.50, 0.50],
};

function zoneToCanvas(
  zone: string,
  sceneWidth: number,
  sceneHeight: number,
  gridSize: number,
  index: number,
): { x: number; y: number } {
  const key = (Object.keys(ZONE_FRACTIONS).includes(zone) ? zone : "random") as ZoneName;
  let [fx, fy] = key === "random"
    ? [0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7]
    : ZONE_FRACTIONS[key];

  // Spread multiple tokens in the same zone into a small cluster
  const offsetCols = index % 3;
  const offsetRows = Math.floor(index / 3);
  fx += (offsetCols - 1) * (gridSize / sceneWidth) * 1.2;
  fy += (offsetRows - 0.5) * (gridSize / sceneHeight) * 1.2;

  // Clamp to scene bounds (leave a grid square of margin)
  const margin = gridSize / 2;
  const x = Math.max(margin, Math.min(sceneWidth - gridSize - margin, Math.round(fx * sceneWidth)));
  const y = Math.max(margin, Math.min(sceneHeight - gridSize - margin, Math.round(fy * sceneHeight)));
  return { x, y };
}

// ---------------------------------------------------------------------------
// Preview HTML helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildEncounterPreviewHtml(
  payload: EncounterCreateApprovalPayload,
  resolved: Map<string, string | null>,
): string {
  const rows = payload.combatants.map((c: EncounterCombatant) => {
    const status = resolved.get(c.name) != null
      ? `<span style="color:#6f6">✓ found</span>`
      : `<span style="color:#f66">✗ not found</span>`;
    const disp = c.disposition === -1 ? "Hostile" : c.disposition === 0 ? "Neutral" : "Friendly";
    return `<tr>
      <td style="padding:2px 6px">${esc(c.name)}</td>
      <td style="padding:2px 6px;text-align:center">${c.quantity}</td>
      <td style="padding:2px 6px">${esc(c.positionZone)}</td>
      <td style="padding:2px 6px">${esc(disp)}</td>
      <td style="padding:2px 6px">${status}</td>
    </tr>`;
  }).join("");

  const notFound = payload.combatants
    .filter((c: EncounterCombatant) => resolved.get(c.name) == null)
    .map((c: EncounterCombatant) => c.name);

  const warningHtml = notFound.length > 0
    ? `<p style="color:#f66;margin:4px 0"><strong>⚠ Not found in world actors:</strong> ${notFound.map(esc).join(", ")}. Create them first via generate_npc + create_actor, then retry.</p>`
    : "";

  return `
    <div style="font-size:0.85em;max-height:480px;overflow-y:auto;padding:4px 8px">
      <h3 style="margin:0 0 4px">🗡 ${esc(payload.encounterName)}</h3>
      <hr style="border-color:#555;margin:4px 0">
      ${payload.hookText ? `<p style="color:#bbb;font-style:italic;margin:4px 0">${esc(payload.hookText)}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin:6px 0">
        <thead><tr style="color:#aaa;font-size:0.9em">
          <th style="text-align:left;padding:2px 6px">Actor</th>
          <th style="padding:2px 6px">Qty</th>
          <th style="text-align:left;padding:2px 6px">Zone</th>
          <th style="text-align:left;padding:2px 6px">Disposition</th>
          <th style="text-align:left;padding:2px 6px">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${warningHtml}
      <p style="color:#aaa;margin:4px 0">Scene: ${esc(payload.sceneId)} · Start combat: ${payload.startCombat ? "Yes" : "No"}</p>
      ${payload.rationale ? `<p style="color:#aaa;font-size:0.8em;margin:2px 0">Reason: ${esc(payload.rationale)}</p>` : ""}
    </div>`;
}

// ---------------------------------------------------------------------------
// Encounter create approval dialog
// ---------------------------------------------------------------------------

export async function showEncounterCreateApprovalDialog(payload: EncounterCreateApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const scene = game.scenes.get(payload.sceneId);
  if (!scene) {
    ui.notifications.error(`LoreBridge: Scene "${payload.sceneId}" not found. Cannot place encounter tokens.`);
    return;
  }

  // Resolve actor names → IDs
  const resolved = new Map<string, string | null>();
  for (const c of payload.combatants) {
    if (c.actorId) {
      resolved.set(c.name, c.actorId);
      continue;
    }
    const found = [...game.actors].find(
      a => a.name.toLowerCase() === c.name.toLowerCase(),
    );
    resolved.set(c.name, found?.id ?? null);
  }

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
  await ChatMessage.create({
    content: `<p><strong>LoreBridge — Encounter Creation Proposal</strong></p><p><strong>${payload.encounterName}</strong></p><p style="font-size:0.8em;color:#888;">Respond via the popup dialog.</p>`,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  const previewHtml = buildEncounterPreviewHtml(payload, resolved);
  const hasUnresolved = [...resolved.values()].some(v => v === null);

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: `Encounter: ${payload.encounterName}`, resizable: true },
    position: { width: 560, height: "auto" },
    content: previewHtml,
    buttons: hasUnresolved
      ? [{ action: "cancel", label: "Cancel", icon: "fas fa-times", default: true }]
      : [
          { action: "approve", label: "Approve & Place Tokens", icon: "fas fa-map-marker-alt" },
          { action: "cancel", label: "Cancel", icon: "fas fa-times", default: true },
        ],
  });

  const result = await dialog.render({ force: true });
  const btn = (result as unknown as { element: HTMLElement }).element;
  if (!btn) return;

  await new Promise<void>(resolve => {
    btn.addEventListener("click", async (ev) => {
      const action = (ev.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
      if (action !== "approve") { resolve(); return; }

      try {
        await placeEncounterTokens(scene, payload, resolved);
        ui.notifications.info(`LoreBridge: Encounter "${payload.encounterName}" placed on ${scene.name}.`);
      } catch (err) {
        ui.notifications.error(`LoreBridge: Failed to place tokens — ${String(err)}`);
      }
      resolve();
    }, { once: true });
  });
}

async function placeEncounterTokens(
  scene: FoundryScene,
  payload: EncounterCreateApprovalPayload,
  resolved: Map<string, string | null>,
): Promise<void> {
  const sceneWidth = scene.width ?? 4000;
  const sceneHeight = scene.height ?? 3000;
  const gridSize = scene.grid?.size ?? 100;

  const tokenData: Record<string, unknown>[] = [];
  let tokenIndex = 0;

  for (const c of payload.combatants) {
    const actorId = resolved.get(c.name);
    if (!actorId) continue;

    const actor = game.actors.get(actorId);
    if (!actor) continue;

    for (let i = 0; i < c.quantity; i++) {
      const pos = zoneToCanvas(c.positionZone, sceneWidth, sceneHeight, gridSize, tokenIndex++);
      tokenData.push({
        actorId: actor.id,
        name: actor.name,
        x: pos.x,
        y: pos.y,
        disposition: c.disposition,
        hidden: false,
        actorLink: false,
      });
    }
  }

  if (tokenData.length === 0) {
    ui.notifications.warn("LoreBridge: No resolvable actors found — no tokens placed.");
    return;
  }

  await scene.createEmbeddedDocuments("Token", tokenData);

  if (payload.startCombat) {
    const combat = await (game.combats as unknown as { create(data: Record<string, unknown>): Promise<{ id: string }> })
      .create({ scene: scene.id, active: true });
    ui.notifications.info(`LoreBridge: Combat started (ID: ${combat.id}). Use set_initiative to assign initiative.`);
  }
}

// ---------------------------------------------------------------------------
// Scene update approval dialog
// ---------------------------------------------------------------------------

function buildSceneUpdatePreviewHtml(payload: SceneUpdateApprovalPayload): string {
  const diffLines = JSON.stringify(payload.diff, null, 2)
    .split("\n")
    .map(l => `<div style="font-family:monospace;font-size:0.8em">${esc(l)}</div>`)
    .join("");

  return `
    <div style="font-size:0.85em;max-height:420px;overflow-y:auto;padding:4px 8px">
      <h3 style="margin:0 0 4px">🗺 ${esc(payload.sceneName)}</h3>
      <hr style="border-color:#555;margin:4px 0">
      <p style="margin:4px 0"><strong>Instruction:</strong> ${esc(payload.instruction)}</p>
      <p style="margin:4px 0;color:#aaa">Proposed changes:</p>
      <div style="background:#1a1a2e;border-radius:4px;padding:6px;margin:4px 0">${diffLines}</div>
      ${payload.rationale ? `<p style="color:#aaa;font-size:0.8em;margin:2px 0">Reason: ${esc(payload.rationale)}</p>` : ""}
    </div>`;
}

export async function showSceneUpdateApprovalDialog(payload: SceneUpdateApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const scene = game.scenes.get(payload.sceneId);
  if (!scene) {
    ui.notifications.error(`LoreBridge: Scene "${payload.sceneId}" not found.`);
    return;
  }

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
  await ChatMessage.create({
    content: `<p><strong>LoreBridge — Scene Update Proposal</strong></p><p><strong>${esc(payload.sceneName)}</strong></p><p style="font-size:0.8em;color:#888;">Respond via the popup dialog.</p>`,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: `Update Scene: ${payload.sceneName}`, resizable: true },
    position: { width: 520, height: "auto" },
    content: buildSceneUpdatePreviewHtml(payload),
    buttons: [
      { action: "approve", label: "Approve & Apply", icon: "fas fa-check" },
      { action: "cancel", label: "Cancel", icon: "fas fa-times", default: true },
    ],
  });

  const result = await dialog.render({ force: true });
  const btn = (result as unknown as { element: HTMLElement }).element;
  if (!btn) return;

  await new Promise<void>(resolve => {
    btn.addEventListener("click", async (ev) => {
      const action = (ev.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
      if (action !== "approve") { resolve(); return; }

      try {
        await scene.update(payload.diff);
        ui.notifications.info(`LoreBridge: Scene "${payload.sceneName}" updated.`);
      } catch (err) {
        ui.notifications.error(`LoreBridge: Failed to update scene — ${String(err)}`);
      }
      resolve();
    }, { once: true });
  });
}
