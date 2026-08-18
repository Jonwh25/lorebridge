import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend } from "./tracker-shared.js";

type ActorDoc = { name: string; type: string; system?: Record<string, unknown> };

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
  const details = sys["details"] as Record<string, unknown> | undefined;

  const fields: [string, unknown][] = [
    ["HP", hp],
    ["Class", details?.["class"]],
    ["Level", details?.["level"]],
    ["Race", details?.["race"]],
    ["Background", details?.["background"]],
    ["Alignment", details?.["alignment"]],
  ];

  for (const [label, value] of fields) {
    if (value !== null && value !== undefined && String(value).trim()) {
      lines.push(`**${label}:** ${String(value).trim()}`);
    }
  }

  return lines.join("\n");
}

export async function runBackupActorsPlayers(): Promise<void> {
  requireFoundryGm("runBackupActorsPlayers");

  const settings = getLoreBridgeSettings();
  const basePath = settings.backupPathPlayers;

  const pcs = Array.from(game.actors as Iterable<ActorDoc>).filter((a) => a.type === "character");
  if (pcs.length === 0) {
    ui.notifications.warn("LoreBridge: No player characters found to back up.");
    return;
  }

  const files = pcs.map((a) => ({
    path: `${basePath}/${safeName(a.name)}.md`,
    content: actorToMarkdown(a),
  }));

  const chunks = chunkArray(files, CHUNK_SIZE);
  ui.notifications.info(`LoreBridge: Backing up ${pcs.length} player actors to GitHub…`);

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      await postBackend<unknown>("v1/backup/github/lore-files", {
        files: chunk,
        commitMessage: `LoreBridge: Backup player actors${partLabel}`,
      });
    }
    ui.notifications.info(`LoreBridge: ✅ Backed up ${pcs.length} player actors.`);
  } catch (err) {
    ui.notifications.error(`LoreBridge player backup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
