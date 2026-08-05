import { searchCampaign } from "./search-campaign.js";
import { exportJournalFolder } from "./backup-journals.js";
import { exportSceneFolder } from "./backup-scenes.js";
import { exportActorFolder } from "./backup-actors.js";
import { exportRollTableFolder } from "./backup-roll-tables.js";
import { restoreSceneFolder } from "./restore-scenes.js";
import { handleSessionCleanup } from "./session-cleanup.js";
import { checkCampaignHealth } from "./health-check.js";
import type { CampaignSearchMatch, BackupFileEntry, BackupDocumentType, DeleteBackupScenesOutput } from "@lorebridge/shared/capabilities";
import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";
const COMMAND_EXACT = "/lb";
const COMMAND_PREFIX = "/lb ";

// ---------------------------------------------------------------------------
// Roleplay state (#99)
// ---------------------------------------------------------------------------

type RoleplayState = {
  actorId: string;
  actorName: string;
  biography: string;
  personality: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

let activeRoleplay: RoleplayState | null = null;

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function askBackend(
  question: string,
  context: Array<{ type: string; name: string; excerpt: string }>,
  worldName: string,
): Promise<string> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, "v1/chat/ask");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ question, context, worldName }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = await response.json() as { answer: string; provider: string };
  return data.answer;
}

async function handleQuestion(question: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb is only available to GMs.");
    return;
  }

  const worldName = game.world?.title ?? "Unknown World";

  try {
    let context: Array<{ type: string; name: string; excerpt: string }> = [];
    try {
      const results = await searchCampaign({ query: question, mode: "gm" });
      context = results.results.slice(0, 5).map((r: CampaignSearchMatch) => {
        if (r.documentType === "journal") {
          return { type: "journal", name: r.journalName, excerpt: r.excerpt ?? "" };
        } else if (r.documentType === "actor") {
          return { type: "actor", name: r.actorName, excerpt: r.excerpt ?? "" };
        } else {
          return { type: "scene", name: r.sceneName, excerpt: "" };
        }
      });
    } catch {
      // context gathering is best-effort; proceed without it
    }

    const answer = await askBackend(question, context, worldName);

    const gmIds = (game.users as { filter(fn: (u: { isGM: boolean }) => boolean): Array<{ id: string }> })
      .filter((u) => u.isGM)
      .map((u) => u.id);

    const content = [
      `<div class="lorebridge-chat-answer">`,
      `<p><strong>LoreBridge — Q:</strong> ${question}</p>`,
      `<hr>`,
      `<p>${answer.replace(/\n/g, "<br>")}</p>`,
      `</div>`,
    ].join("\n");

    await ChatMessage.create({
      content,
      whisper: gmIds,
      speaker: { alias: "LoreBridge" },
      flags: { [MODULE_ID]: { type: "chat-answer", question } },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ui.notifications.error(`LoreBridge: ${msg}`);
  }
}

async function roleplayBackend(state: RoleplayState, message: string): Promise<string> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, "v1/generate/roleplay");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      actorName: state.actorName,
      biography: state.biography,
      personality: state.personality,
      history: state.history,
      message,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = await response.json() as { response: string };
  return data.response;
}

async function handleRoleplayMessage(message: string): Promise<void> {
  if (!activeRoleplay) return;
  const state = activeRoleplay;
  try {
    const response = await roleplayBackend(state, message);
    state.history.push({ role: "user", content: message });
    state.history.push({ role: "assistant", content: response });
    // Keep history bounded to last 20 turns
    if (state.history.length > 20) state.history = state.history.slice(-20);

    const gmIds = (game.users as { filter(fn: (u: { isGM: boolean }) => boolean): Array<{ id: string }> })
      .filter((u) => u.isGM)
      .map((u) => u.id);

    const content = [
      `<div class="lorebridge-chat-answer">`,
      `<p><em>${state.actorName} says:</em></p>`,
      `<p>${response.replace(/\n/g, "<br>")}</p>`,
      `</div>`,
    ].join("\n");

    await ChatMessage.create({
      content,
      whisper: gmIds,
      speaker: { alias: state.actorName },
      flags: { [MODULE_ID]: { type: "roleplay", actorName: state.actorName } },
    });
  } catch (error) {
    ui.notifications.error(`LoreBridge roleplay failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function startRoleplay(actorName: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb roleplay is only available to GMs.");
    return;
  }
  const name = actorName.trim();
  if (!name) {
    ui.notifications.warn("LoreBridge: Usage: /lb roleplay <NPC name>");
    return;
  }

  const actors = Array.from(game.actors as Iterable<FoundryActor>);
  const actor = actors.find((a) => a.name.toLowerCase() === name.toLowerCase())
    ?? actors.find((a) => a.name.toLowerCase().includes(name.toLowerCase()));

  if (!actor) {
    ui.notifications.warn(`LoreBridge: No actor found named "${name}".`);
    return;
  }

  const biography = ((actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "")
    .replace(/<[^>]+>/g, "").slice(0, 2000);
  const personality = ((actor.system as { details?: { trait?: string; ideal?: string } })?.details?.trait ?? "");

  activeRoleplay = {
    actorId: actor.id,
    actorName: actor.name,
    biography,
    personality,
    history: [],
  };

  const gmIds = (game.users as { filter(fn: (u: { isGM: boolean }) => boolean): Array<{ id: string }> })
    .filter((u) => u.isGM)
    .map((u) => u.id);

  await ChatMessage.create({
    content: `<p><em>LoreBridge: Now in roleplay mode as <strong>${actor.name}</strong>. Type <code>/lb &lt;message&gt;</code> to speak with them, or <code>/lb end</code> to stop.</em></p>`,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
    flags: { [MODULE_ID]: { type: "roleplay-start", actorName: actor.name } },
  });
}

function markdownToHtml(text: string): string {
  return text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(?!<[hul])/, "<p>")
    .replace(/(?<![>])$/, "</p>");
}

async function callGenerateEndpoint(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function saveToJournal(journalName: string, pageName: string, html: string): Promise<void> {
  let journal = Array.from(game.journal as Iterable<FoundryJournalEntry>).find((j) => j.name === journalName);
  if (!journal) {
    journal = await JournalEntry.create({ name: journalName, ownership: { default: 0 } });
  }
  if (!journal) throw new Error(`Failed to create journal "${journalName}".`);
  await journal.createEmbeddedDocuments("JournalEntryPage", [
    { name: pageName, type: "text", text: { content: html } },
  ]);
  journal.sheet?.render(true);
}

function showGeneratorDialog(title: string, html: string, journalName: string, pageName: string): void {
  const dialog = new foundry.applications.api.DialogV2({
    window: { title, resizable: true },
    position: { width: 680, height: "auto" },
    content: `
      <div style="max-height:500px;overflow-y:auto;padding:8px;font-size:13px;line-height:1.5">
        ${html}
      </div>
      <p style="margin-top:8px;font-size:11px;color:#666">
        Saving to <strong>${journalName}</strong> → page <strong>${pageName}</strong>
      </p>`,
    buttons: [
      {
        action: "save",
        label: "Save as Journal",
        icon: "fas fa-book",
        default: true,
        callback: () => {
          void saveToJournal(journalName, pageName, html).catch((err) => {
            ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : String(err)}`);
          });
        },
      },
      { action: "close", label: "Close" },
    ],
  });
  dialog.render({ force: true });
}

async function handleCityGeneration(description: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb city is only available to GMs.");
    return;
  }
  const worldName = game.world?.title ?? "Unknown World";
  const tone = "neutral";

  ui.notifications.info("LoreBridge: Generating city description…");

  try {
    let context: Array<{ type: string; name: string; excerpt: string }> = [];
    try {
      const results = await searchCampaign({ query: description, mode: "gm" });
      context = results.results.slice(0, 8).map((r: CampaignSearchMatch) => {
        if (r.documentType === "journal") return { type: "journal", name: r.journalName, excerpt: r.excerpt ?? "" };
        if (r.documentType === "actor") return { type: "actor", name: r.actorName, excerpt: r.excerpt ?? "" };
        return { type: "scene", name: r.sceneName, excerpt: "" };
      });
    } catch { /* best-effort */ }

    const result = await callGenerateEndpoint("v1/generate/city", { description, worldName, tone, context });
    const content = typeof result["content"] === "string" ? result["content"] : "";
    const html = markdownToHtml(content);
    const pageName = description.slice(0, 60).trim();
    showGeneratorDialog(`City — ${pageName}`, html, "Generated Locations", pageName);
  } catch (error) {
    ui.notifications.error(`LoreBridge: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleNpcGeneration(args: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb npcs is only available to GMs.");
    return;
  }

  // Optional leading number: "/lb npcs 3 corrupt river town"
  const countMatch = args.match(/^(\d+)\s+(.+)/);
  const count = countMatch ? parseInt(countMatch[1] ?? "5", 10) : 5;
  const locationDescription = (countMatch ? countMatch[2] ?? args : args).trim();

  if (!locationDescription) {
    ui.notifications.warn("LoreBridge: Usage: /lb npcs [count] <location description>");
    return;
  }

  const worldName = game.world?.title ?? "Unknown World";
  const tone = "neutral";

  ui.notifications.info(`LoreBridge: Generating ${count} NPCs…`);

  try {
    let context: Array<{ type: string; name: string; excerpt: string }> = [];
    try {
      const results = await searchCampaign({ query: locationDescription, mode: "gm" });
      context = results.results.slice(0, 8).map((r: CampaignSearchMatch) => {
        if (r.documentType === "journal") return { type: "journal", name: r.journalName, excerpt: r.excerpt ?? "" };
        if (r.documentType === "actor") return { type: "actor", name: r.actorName, excerpt: r.excerpt ?? "" };
        return { type: "scene", name: r.sceneName, excerpt: "" };
      });
    } catch { /* best-effort */ }

    const result = await callGenerateEndpoint("v1/generate/npcs", { locationDescription, count, worldName, tone, context });
    const content = typeof result["content"] === "string" ? result["content"] : "";
    const html = markdownToHtml(content);
    const pageName = locationDescription.slice(0, 60).trim();
    showGeneratorDialog(`NPCs — ${pageName}`, html, "Generated NPCs", pageName);
  } catch (error) {
    ui.notifications.error(`LoreBridge: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Backup command (#135, #129)
// ---------------------------------------------------------------------------

async function postBackupRequest(
  type: BackupDocumentType,
  folderName: string,
  preview: boolean,
  files: BackupFileEntry[],
  commitMessage?: string,
): Promise<Record<string, unknown>> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, "v1/backup/github/export");
  const body: Record<string, unknown> = { type, folderName, preview, files };
  if (commitMessage) body.commitMessage = commitMessage;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function handleBackupCommand(
  type: BackupDocumentType,
  folderName: string,
): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb backup is only available to GMs.");
    return;
  }
  if (!folderName) {
    ui.notifications.warn(
      `LoreBridge: Usage: /lb backup ${type} <folder name>`,
    );
    return;
  }

  ui.notifications.info(
    `LoreBridge: Serializing ${type} in folder "${folderName}"…`,
  );

  let files: BackupFileEntry[];
  let warnings: string[];

  try {
    if (type === "journals") {
      ({ files, warnings } = await exportJournalFolder(folderName));
    } else if (type === "scenes") {
      ({ files, warnings } = await exportSceneFolder(folderName));
    } else if (type === "actors") {
      ({ files, warnings } = await exportActorFolder(folderName));
    } else {
      ({ files, warnings } = await exportRollTableFolder(folderName));
    }
  } catch (error) {
    ui.notifications.error(
      `LoreBridge backup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  // Preview via the backend (validates paths).
  try {
    await postBackupRequest(type, folderName, true, files);
  } catch (error) {
    ui.notifications.error(
      `LoreBridge backup preview failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  // Build a readable summary of what will be committed.
  const fileListHtml = files
    .map((f) => `<li><code>${f.path}</code></li>`)
    .join("");
  const warningHtml =
    warnings.length > 0
      ? `<p><strong>Warnings:</strong></p><ul>${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>`
      : "";

  const dialogContent = `
    <div style="max-height:420px;overflow-y:auto;padding-right:4px;">
      <p><strong>LoreBridge — GitHub Backup Preview</strong></p>
      <p>Folder: <strong>${folderName}</strong> (${files.length} file${files.length === 1 ? "" : "s"})</p>
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">Files to commit</summary>
        <ul style="font-size:0.85em;margin-top:4px;">${fileListHtml}</ul>
      </details>
      ${warningHtml}
      <p style="margin-top:8px;font-size:0.85em;color:#888;">
        Click <strong>Commit to GitHub</strong> to write these files. This cannot be undone.
      </p>
    </div>
  `;

  // Capture files in closure for the confirm callback.
  const capturedFiles = files;
  const capturedType = type;
  const capturedFolder = folderName;

  new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — Backup Preview", resizable: true },
    position: { width: 580, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "commit",
        label: "Commit to GitHub",
        icon: "fas fa-cloud-upload-alt",
        default: true,
        callback: () => {
          void postBackupRequest(
            capturedType,
            capturedFolder,
            false,
            capturedFiles,
          )
            .then((result) => {
              const sha = String((result as Record<string, unknown>).commitSha ?? "");
              const commitUrl = String(
                (result as Record<string, unknown>).commitUrl ?? "",
              );
              const shortSha = sha.slice(0, 7);
              ui.notifications.info(
                `LoreBridge: Backup committed — ${shortSha}`,
              );
              const gmIds = game.users
                .filter((u) => u.isGM)
                .map((u) => u.id);
              void ChatMessage.create({
                content: `<p><strong>LoreBridge Backup</strong> — ${capturedType} folder "${capturedFolder}" committed to GitHub.</p>${commitUrl ? `<p><a href="${commitUrl}" target="_blank">View commit ${shortSha}</a></p>` : ""}`,
                whisper: gmIds,
                speaker: { alias: "LoreBridge" },
                flags: {
                  [MODULE_ID]: {
                    type: "backup-commit",
                    backupType: capturedType,
                    folderName: capturedFolder,
                    commitSha: sha,
                  },
                },
              });
            })
            .catch((err: unknown) => {
              ui.notifications.error(
                `LoreBridge backup commit failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        },
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fas fa-times",
      },
    ],
  }).render({ force: true });
}

async function handleBackupDeleteScenesCommand(folderName: string): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb backup delete is only available to GMs.");
    return;
  }

  const dialogContent = `
    <div style="padding:4px;">
      <p><strong>LoreBridge — Delete Backup</strong></p>
      <p>This will permanently delete all scene and folder backup files for <strong>${folderName}</strong> from GitHub.</p>
      <p style="color:#c0392b;margin-top:8px;"><strong>This cannot be undone.</strong> The scenes will remain in Foundry — only the GitHub backup is affected.</p>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — Delete Backup", resizable: false },
    position: { width: 480, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "delete",
        label: "Delete from GitHub",
        icon: "fas fa-trash",
        default: false,
        callback: () => {
          const settings = getLoreBridgeSettings();
          if (!settings.backendUrl || !settings.clientToken) {
            ui.notifications.error("LoreBridge backend is not configured or paired.");
            return;
          }
          const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
          const url = `${base}v1/backup/github/scenes?folderName=${encodeURIComponent(folderName)}`;
          void fetch(url, {
            method: "DELETE",
            headers: { authorization: `Bearer ${settings.clientToken}` },
          })
            .then(async (res) => {
              if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
                throw new Error(err?.error?.message ?? `Backend error ${res.status}`);
              }
              return res.json() as Promise<DeleteBackupScenesOutput>;
            })
            .then((result) => {
              const shortSha = result.commitSha.slice(0, 7);
              ui.notifications.info(
                `LoreBridge: Deleted ${result.filesDeleted} backup file(s) for "${folderName}" — commit ${shortSha}`,
              );
              const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
              void ChatMessage.create({
                content: `<p><strong>LoreBridge</strong> — Deleted GitHub backup for scenes folder "<strong>${folderName}</strong>" (${result.filesDeleted} file(s), commit <code>${shortSha}</code>).</p>`,
                whisper: gmIds,
                speaker: { alias: "LoreBridge" },
                flags: { [MODULE_ID]: { type: "backup-delete", folderName, commitSha: result.commitSha } },
              });
            })
            .catch((err: unknown) => {
              ui.notifications.error(
                `LoreBridge backup delete failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        },
      },
      { action: "cancel", label: "Cancel", icon: "fas fa-times", default: true },
    ],
  }).render({ force: true });
}

// ---------------------------------------------------------------------------
// Health check command (#169)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function handleHealthCheck(full: boolean): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("LoreBridge: /lb health is only available to GMs.");
    return;
  }

  ui.notifications.info("LoreBridge: Running campaign health check…");

  try {
    const result = await checkCampaignHealth(full ? { limit: 500 } : {});

    const sevIcon = (s: string) => s === "error" ? "🔴" : "⚠️";
    const catLabel = (c: string) => c.replace(/-/g, " ");

    const rows = result.findings.map((f) =>
      `<tr style="border-bottom:1px solid #e0e0e0">
        <td style="padding:3px 6px;white-space:nowrap">${sevIcon(f.severity)}</td>
        <td style="padding:3px 6px;white-space:nowrap;font-size:11px;color:#666">${catLabel(f.category)}</td>
        <td style="padding:3px 6px;font-size:12px">${escapeHtml(f.sourceName)}</td>
        <td style="padding:3px 6px;font-size:12px;color:#444">${escapeHtml(f.detail)}</td>
      </tr>`,
    ).join("");

    const truncatedNote = result.truncated
      ? `<span style="color:#c0392b;font-size:12px">Results capped at ${result.findings.length}. Use <code>/lb health full</code> to scan up to 500.</span>`
      : "";

    const summary = `Scanned ${result.documentsScanned.toLocaleString()} documents · Checks: ${result.checksRun.join(", ")}`;

    const content = `
      <div style="font-size:13px;line-height:1.5;height:100%;display:flex;flex-direction:column;gap:6px">
        <p style="margin:0;flex-shrink:0">
          <strong>Campaign Health — ${escapeHtml(result.sourceName)}</strong>
          <span style="font-size:11px;color:#888;margin-left:8px">${summary}</span>
        </p>
        ${result.findings.length === 0
          ? `<p style="color:#27ae60;flex-shrink:0">✅ No issues found.</p>`
          : `<div style="flex:1;min-height:0;overflow-y:auto">
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="border-bottom:2px solid #ccc;position:sticky;top:0;background:var(--color-bg, #1a1a1a)">
                    <th style="text-align:left;padding:4px 6px">Sev</th>
                    <th style="text-align:left;padding:4px 6px">Category</th>
                    <th style="text-align:left;padding:4px 6px">Source</th>
                    <th style="text-align:left;padding:4px 6px">Detail</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`}
        ${truncatedNote ? `<p style="flex-shrink:0;margin:0">${truncatedNote.replace(/<p[^>]*>|<\/p>/g, "")}</p>` : ""}
      </div>`;

    new foundry.applications.api.DialogV2({
      window: { title: `LoreBridge Health — ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"}`, resizable: true },
      position: { width: 800, height: 600 },
      content,
      buttons: [
        ...(result.truncated && !full ? [{
          action: "full",
          label: "Full Scan (500)",
          icon: "fas fa-search",
          callback: () => { void handleHealthCheck(true); },
        }] : []),
        { action: "close", label: "Close", default: true },
      ],
    }).render({ force: true });

  } catch (error) {
    ui.notifications.error(`LoreBridge health check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isLbCommand(value: string): boolean {
  const t = value.trim();
  return t === COMMAND_EXACT || t.startsWith(COMMAND_PREFIX);
}

function extractArguments(value: string): string {
  const t = value.trim();
  return t.startsWith(COMMAND_PREFIX) ? t.slice(COMMAND_PREFIX.length).trim() : "";
}

export function registerChatCommand(): void {
  // chatInput is the v14 hook for intercepting chat input keystrokes.
  // Returning false suppresses default processing (prevents the "not a valid
  // command" error). Setting options.recordPending = false keeps chat history
  // in sync when we clear the input ourselves.
  Hooks.on("chatInput", (event: unknown, options: unknown): boolean | void => {
    const e = event as KeyboardEvent;
    if (e.key !== "Enter" || e.shiftKey) return;

    const target = e.target as HTMLElement;
    const text = (
      (target as { value?: string }).value ??
      target.textContent ??
      ""
    ).trim();

    if (!isLbCommand(text)) return;

    const args = extractArguments(text);

    const clearInput = () => {
      if ("value" in target) {
        (target as HTMLInputElement).value = "";
      } else {
        target.textContent = "";
      }
    };

    if (!getLoreBridgeSettings().chatCommandEnabled) {
      // Consume disabled commands without sending them to Foundry's slash-command parser.
      (options as { recordPending: boolean }).recordPending = false;
      clearInput();
      return false;
    }

    // Prevent Foundry's command validator and history recording
    (options as { recordPending: boolean }).recordPending = false;

    if (!args) {
      ui.notifications.warn("LoreBridge: Please include a question after /lb, e.g. /lb Who is Strahd?");
      return false;
    }

    // /lb end — stop roleplay
    if (args === "end") {
      clearInput();
      if (activeRoleplay) {
        const name = activeRoleplay.actorName;
        activeRoleplay = null;
        ui.notifications.info(`LoreBridge: Roleplay with ${name} ended.`);
      } else {
        ui.notifications.warn("LoreBridge: No active roleplay session.");
      }
      return false;
    }

    // /lb roleplay <name>
    if (args.startsWith("roleplay ")) {
      clearInput();
      const actorName = args.slice("roleplay ".length).trim();
      void startRoleplay(actorName);
      return false;
    }

    // /lb city <description>
    if (args.startsWith("city ") || args === "city") {
      const description = args.slice("city".length).trim();
      if (!description) {
        ui.notifications.warn("LoreBridge: Usage: /lb city <location description>");
        return false;
      }
      clearInput();
      void handleCityGeneration(description);
      return false;
    }

    // /lb npcs [count] <description>
    if (args.startsWith("npcs ") || args === "npcs") {
      const npcArgs = args.slice("npcs".length).trim();
      if (!npcArgs) {
        ui.notifications.warn("LoreBridge: Usage: /lb npcs [count] <location description>");
        return false;
      }
      clearInput();
      void handleNpcGeneration(npcArgs);
      return false;
    }

    // /lb backup journals|scenes|actors|rolltables <folder name>
    // /lb backup delete scenes <folder name>
    if (args.startsWith("backup ")) {
      const backupArgs = args.slice("backup ".length).trim();
      const deleteMatch = backupArgs.match(/^delete\s+scenes\s+(.+)$/i);
      const journalsMatch = backupArgs.match(/^journals\s+(.+)$/i);
      const scenesMatch = backupArgs.match(/^scenes\s+(.+)$/i);
      const actorsMatch = backupArgs.match(/^actors\s+(.+)$/i);
      const rollTablesMatch = backupArgs.match(/^rolltables\s+(.+)$/i);
      if (deleteMatch) {
        clearInput();
        void handleBackupDeleteScenesCommand(deleteMatch[1]!.trim());
        return false;
      }
      if (journalsMatch) {
        clearInput();
        void handleBackupCommand("journals", journalsMatch[1]!.trim());
        return false;
      }
      if (scenesMatch) {
        clearInput();
        void handleBackupCommand("scenes", scenesMatch[1]!.trim());
        return false;
      }
      if (actorsMatch) {
        clearInput();
        void handleBackupCommand("actors", actorsMatch[1]!.trim());
        return false;
      }
      if (rollTablesMatch) {
        clearInput();
        void handleBackupCommand("rolltables", rollTablesMatch[1]!.trim());
        return false;
      }
      ui.notifications.warn(
        "LoreBridge: Usage: /lb backup journals|scenes|actors|rolltables <folder name>",
      );
      return false;
    }

    // /lb restore scenes <folder name> [from <sha>]
    if (args.startsWith("restore ")) {
      const restoreArgs = args.slice("restore ".length).trim();
      const scenesMatch = restoreArgs.match(/^scenes\s+(.+?)(?:\s+from\s+([a-f0-9]+))?$/i);
      if (scenesMatch) {
        clearInput();
        void restoreSceneFolder(scenesMatch[1]!.trim(), scenesMatch[2]?.trim());
        return false;
      }
      ui.notifications.warn("LoreBridge: Usage: /lb restore scenes <folder name> [from <commitSha>]");
      return false;
    }

    // /lb health [full]
    if (args === "health" || args.startsWith("health ")) {
      const full = args === "health full";
      clearInput();
      void handleHealthCheck(full);
      return false;
    }

    // /lb cleanup [<session name>]
    if (args === "cleanup" || args.startsWith("cleanup ")) {
      const cleanupArgs = args.slice("cleanup".length).trim();
      clearInput();
      void handleSessionCleanup(cleanupArgs);
      return false;
    }

    // /lb <message> — route to roleplay or Q&A
    if (activeRoleplay) {
      clearInput();
      void handleRoleplayMessage(args);
    } else {
      void handleQuestion(args);
    }
    return false;
  });
}
