import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend } from "./tracker-shared.js";
import { BackupProgressDialog } from "../utils/backup-progress.js";
import { promptFolderSelection } from "../utils/backup-folder-picker.js";

type ActorDoc = {
  name: string;
  type: string;
  folder?: { id: string; name: string } | null;
  system?: Record<string, unknown>;
};

const CHUNK_SIZE = 25;

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function actorToMarkdown(actor: ActorDoc): string {
  const sys = actor.system ?? {};
  const lines: string[] = [`# ${actor.name}`, ""];

  const hpData = (sys["attributes"] as Record<string, unknown> | undefined)?.["hp"] as Record<string, unknown> | undefined;
  const hp = hpData ? `${hpData["value"] ?? "?"}/${hpData["max"] ?? "?"}` : null;

  const fields: [string, unknown][] = [
    ["Type", actor.type],
    ["HP", hp],
    ["CR", (sys["details"] as Record<string, unknown> | undefined)?.["cr"]],
    ["Size", (sys["traits"] as Record<string, unknown> | undefined)?.["size"]],
    ["Alignment", (sys["details"] as Record<string, unknown> | undefined)?.["alignment"]],
    ["Race", (sys["details"] as Record<string, unknown> | undefined)?.["race"]],
  ];

  for (const [label, value] of fields) {
    if (value !== null && value !== undefined && String(value).trim()) {
      lines.push(`**${label}:** ${String(value).trim()}`);
    }
  }

  return lines.join("\n");
}

export async function runBackupActorsNpcs(): Promise<void> {
  requireFoundryGm("runBackupActorsNpcs");

  const settings = getLoreBridgeSettings();
  const basePath = settings.backupPathNpcs;

  const npcs = Array.from(game.actors as Iterable<ActorDoc>).filter((a) => a.type === "npc");
  if (npcs.length === 0) {
    ui.notifications.warn("LoreBridge: No NPC actors found to back up.");
    return;
  }

  const folderMap = new Map<string | null, string>();
  for (const a of npcs) {
    const id = a.folder?.id ?? null;
    if (!folderMap.has(id)) folderMap.set(id, a.folder?.name ?? "(No Folder)");
  }
  const folders = Array.from(folderMap.entries())
    .sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""))
    .map(([id, name]) => ({ id, name }));

  const selected = await promptFolderSelection("Backup NPC Actors — Select Folders", folders);
  if (selected === null) return;

  const selectedSet = new Set(selected);
  const filtered = npcs.filter((a) => selectedSet.has(a.folder?.id ?? null));
  if (filtered.length === 0) {
    ui.notifications.warn("LoreBridge: No NPC actors in the selected folders.");
    return;
  }

  const files = filtered.map((a) => ({
    path: `${basePath}/${safeName(a.name)}.md`,
    content: actorToMarkdown(a),
  }));

  const chunks = chunkArray(files, CHUNK_SIZE);
  const progress = new BackupProgressDialog(`Backing up ${filtered.length} NPC actors to GitHub…`, files.length);
  await progress.render(true);

  try {
    let done = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      await postBackend<unknown>("v1/backup/github/lore-files", {
        files: chunk,
        commitMessage: `LoreBridge: Backup NPC actors${partLabel}`,
        repoRoot: "",
      });
      done += chunk.length;
      progress.setProgress(done);
    }
    await progress.close();
    ui.notifications.info(`LoreBridge: ✅ Backed up ${filtered.length} NPC actors.`);
  } catch (err) {
    await progress.close();
    ui.notifications.error(`LoreBridge NPC backup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
