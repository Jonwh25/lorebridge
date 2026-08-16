/**
 * CC Journal Export — issue #291
 *
 * Exports every journal inside each "Campaign Codex - *" folder tree, plus
 * each page of the Session Logs journal, to GitHub under
 * sources/campaign codex/<folder>/<subfolders>/<name>.md.
 *
 * Subfolder structure is preserved (e.g. Quests/Available/, Quests/Completed/).
 * Files are committed in chunks of CHUNK_SIZE so rate limits and proxy
 * timeouts are never hit even for large folders like NPCs (100+) or
 * Session Logs (60+).
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { postBackend, buildBackendUrl, escHtml, showResultDialog } from "./tracker-shared.js";
import { buildFolderMap, collectSubtreeIds, type FoundryFolder } from "./backup-folders.js";
import { plainText } from "../utils/html.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FoundryPage = {
  name: string;
  text?: { content?: string; format?: number };
  type?: string;
};

type QuestObjective = {
  text?: string;
  completed?: boolean;
  failed?: boolean;
  objectives?: QuestObjective[];
};

type NpcDossier = {
  reference?: {
    sourceBook?: string;
    sourcePage?: string;
    statBlockReference?: string;
    discoveryRegion?: string;
    discoveryLocation?: string;
    nicknames?: string;
    status?: string;
  };
  identity?: {
    alignment?: string;
    weight?: string;
    occupationOrClass?: string;
    race?: string;
    sexOrGender?: string;
    age?: string;
    height?: string;
    eyes?: string;
    hair?: string;
    appearance?: string;
  };
  overview?: {
    playerKnowledge?: string;
    profileTagline?: string;
    bullets?: string[];
    secretsNarrative?: string;
  };
  roleplay?: {
    tagline?: string;
    firstImpression?: string;
    personality?: string;
    motivation?: string;
    fear?: string;
    mannerisms?: string;
    voiceOrSpeech?: string;
    conversationalApproach?: string;
    atTheTable?: string;
    goals?: string[];
  };
  knowledge?: Array<{ statement?: string; topicOrCategory?: string; quality?: string }>;
  knowledgeLimits?: string;
};

type CcQuestData = {
  description?: string;
  notes?: string;
  quests?: Array<{
    title?: string;
    completed?: boolean;
    failed?: boolean;
    inactive?: boolean;
    visible?: boolean;
    urgency?: string;
    objectives?: QuestObjective[];
    questGiverUuid?: string;
    unlocks?: string[];
    dependencies?: string[];
    relatedUuids?: string[];
  }>;
};

type FoundryJournal = {
  id: string;
  name: string;
  folder?: { id: string } | null;
  pages: Iterable<FoundryPage>;
  flags?: {
    "campaign-codex"?: { type?: string; data?: CcQuestData };
    "lorebridge"?: { npcDossier?: NpcDossier };
  };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CC_FOLDER_PREFIX = "campaign codex - ";
const REPO_ROOT = "sources";
const EXPORT_BASE = "campaign codex";
const CHUNK_SIZE = 25; // files per commit — keeps each request under ~10 s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Markdown formatters
// ---------------------------------------------------------------------------

function s(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function field(label: string, value: unknown): string {
  const val = s(value);
  return val ? `**${label}:** ${val}` : "";
}

/** Convert a bullet-list HTML string (<ul><li>…</li></ul>) to "- item" lines. */
function htmlListToMarkdown(html: string): string {
  if (!html) return "";
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const items = Array.from(doc.querySelectorAll("li"));
    if (items.length > 0) {
      return items.map((li) => `- ${li.textContent?.trim() ?? ""}`).filter((l) => l !== "- ").join("\n");
    }
    return doc.body.textContent?.trim() ?? "";
  }
  return plainText(html);
}

function formatObjectives(objectives: QuestObjective[], depth = 0): string[] {
  const indent = "  ".repeat(depth);
  const result: string[] = [];
  for (const obj of objectives) {
    const text = s(obj.text);
    if (!text) continue;
    const checkbox = obj.failed ? "[!]" : obj.completed ? "[x]" : "[ ]";
    result.push(`${indent}- ${checkbox} ${text}`);
    if (Array.isArray(obj.objectives) && obj.objectives.length > 0) {
      result.push(...formatObjectives(obj.objectives, depth + 1));
    }
  }
  return result;
}

function npcToMarkdown(name: string, dossier: NpcDossier): string {
  const parts: string[] = [`# ${name}`, ""];

  const ref = dossier.reference ?? {};
  const refLines = [
    field("Status", ref.status),
    field("Nickname", ref.nicknames),
    field(
      "Source",
      ref.sourceBook
        ? `${ref.sourceBook}${ref.sourcePage ? `, p.${ref.sourcePage}` : ""}`
        : "",
    ),
    field("Stat Block", ref.statBlockReference),
    field(
      "Discovery",
      ref.discoveryRegion
        ? `${ref.discoveryRegion}${ref.discoveryLocation ? ` — ${ref.discoveryLocation}` : ""}`
        : "",
    ),
  ].filter(Boolean);
  if (refLines.length) parts.push("## Reference", "", ...refLines, "");

  const id = dossier.identity ?? {};
  const idLines = [
    field("Race/Type", id.race),
    field("Gender", id.sexOrGender),
    field("Age", id.age),
    field("Occupation", id.occupationOrClass),
    field("Alignment", id.alignment),
    field("Height", id.height),
    field("Weight", id.weight),
    field("Eyes", id.eyes),
    field("Hair", id.hair),
    field("Appearance", id.appearance),
  ].filter(Boolean);
  if (idLines.length) parts.push("## Identity", "", ...idLines, "");

  const ov = dossier.overview ?? {};
  const ovLines: string[] = [];
  if (s(ov.profileTagline)) ovLines.push(ov.profileTagline!.trim());
  if (Array.isArray(ov.bullets) && ov.bullets.length) {
    ov.bullets.forEach((b) => { if (s(b)) ovLines.push(`- ${b.trim()}`); });
  }
  if (s(ov.playerKnowledge)) ovLines.push("", `**Player Knowledge:** ${ov.playerKnowledge!.trim()}`);
  if (s(ov.secretsNarrative)) ovLines.push("", `**GM Notes:** ${ov.secretsNarrative!.trim()}`);
  if (ovLines.length) parts.push("## Overview", "", ...ovLines, "");

  const rp = dossier.roleplay ?? {};
  const rpLines = [
    field("Tagline", rp.tagline),
    field("First Impression", rp.firstImpression),
    field("Personality", rp.personality),
    field("Motivation", rp.motivation),
    field("Fear", rp.fear),
    field("Mannerisms", rp.mannerisms),
    field("Voice/Speech", rp.voiceOrSpeech),
    field("Conversational Approach", rp.conversationalApproach),
    field("At the Table", rp.atTheTable),
  ].filter(Boolean);
  if (Array.isArray(rp.goals) && rp.goals.length) {
    rpLines.push("**Goals:**");
    rp.goals.forEach((g) => { if (s(g)) rpLines.push(`- ${g.trim()}`); });
  }
  if (rpLines.length) parts.push("## Roleplay", "", ...rpLines, "");

  if (Array.isArray(dossier.knowledge) && dossier.knowledge.length) {
    const kLines = dossier.knowledge
      .filter((k) => s(k.statement))
      .map((k) => `- (${k.topicOrCategory ?? "unknown"}) ${k.quality ?? "knows"}: ${k.statement!.trim()}`);
    if (kLines.length) {
      parts.push("## Knowledge", "", ...kLines);
      if (s(dossier.knowledgeLimits)) parts.push("", `*${dossier.knowledgeLimits!.trim()}*`);
      parts.push("");
    }
  }

  return parts.join("\n");
}

function resolveUuidName(uuid: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (globalThis as any).fromUuidSync?.(uuid);
    return doc?.name ?? uuid;
  } catch {
    return uuid;
  }
}

function resolveUuidNames(uuids: string[] | undefined): string {
  if (!Array.isArray(uuids) || uuids.length === 0) return "";
  return uuids.map(resolveUuidName).join(", ");
}

function questToMarkdown(name: string, data: CcQuestData): string {
  const parts: string[] = [`# ${name}`, ""];

  const quest = data.quests?.[0];
  if (quest) {
    const status = quest.failed ? "Failed" : quest.completed ? "Completed" : quest.inactive ? "Inactive" : "Active";
    const urgency = s(quest.urgency);
    const urgencyLabel = urgency ? urgency.charAt(0).toUpperCase() + urgency.slice(1) : "";
    const flags = [
      `**Status:** ${status}`,
      urgencyLabel ? `**Urgency:** ${urgencyLabel}` : "",
      quest.visible !== undefined ? `**Visible:** ${quest.visible ? "Yes" : "No"}` : "",
    ].filter(Boolean);
    parts.push(flags.join(" | "), "");

    const questGiver = quest.questGiverUuid ? resolveUuidName(quest.questGiverUuid) : "";
    const unlocks = resolveUuidNames(quest.unlocks);
    const dependsOn = resolveUuidNames(quest.dependencies);
    const related = resolveUuidNames(quest.relatedUuids);
    const linkLines = [
      questGiver ? `**Quest Giver:** ${questGiver}` : "",
      dependsOn ? `**Depends On:** ${dependsOn}` : "",
      unlocks ? `**Unlocks:** ${unlocks}` : "",
      related ? `**Related:** ${related}` : "",
    ].filter(Boolean);
    if (linkLines.length) parts.push("## Quest Links", "", ...linkLines, "");
  }

  const description = plainText(data.description ?? "").trim();
  if (description) parts.push("## Description", "", description, "");

  if (quest && Array.isArray(quest.objectives) && quest.objectives.length > 0) {
    const objLines = formatObjectives(quest.objectives);
    if (objLines.length) parts.push("## Objectives", "", ...objLines, "");
  }

  const notes = htmlListToMarkdown(data.notes ?? "").trim();
  if (notes) parts.push("## Notes", "", notes, "");

  return parts.join("\n");
}

function journalToMarkdown(journal: FoundryJournal): string {
  const cc = journal.flags?.["campaign-codex"];

  if (cc?.type === "npc") {
    const dossier = journal.flags?.["lorebridge"]?.npcDossier;
    if (dossier) return npcToMarkdown(journal.name, dossier);
  }

  if (cc?.type === "quest" && cc.data) {
    return questToMarkdown(journal.name, cc.data);
  }

  // Other CC types (location, faction, group, region) and non-CC journals:
  // fall back to reading page text content.
  const lines: string[] = [`# ${journal.name}`, ""];
  for (const page of journal.pages) {
    if (page.name) lines.push(`## ${page.name}`, "");
    const content = plainText(page.text?.content ?? "").trim();
    if (content) lines.push(content, "");
  }
  return lines.join("\n");
}

function pageToMarkdown(page: FoundryPage): string {
  const lines: string[] = [`# ${page.name}`, ""];
  const content = plainText(page.text?.content ?? "").trim();
  if (content) lines.push(content, "");
  return lines.join("\n");
}

function getCCRootFolders(folderById: Map<string, FoundryFolder>): FoundryFolder[] {
  return Array.from(folderById.values()).filter(
    (f) =>
      typeof f.name === "string" &&
      f.name.toLowerCase().startsWith(CC_FOLDER_PREFIX) &&
      f.type === "JournalEntry",
  );
}

function relativePathSegments(
  folderId: string,
  rootFolderId: string,
  folderById: Map<string, FoundryFolder>,
): string[] {
  const segments: string[] = [];
  let current: string | undefined = folderId;
  while (current && current !== rootFolderId) {
    const f = folderById.get(current);
    if (!f) break;
    segments.unshift(safeName(f.name));
    current = f.folder?.id;
  }
  return segments;
}

function journalsInSubtree(
  rootFolder: FoundryFolder,
  folderById: Map<string, FoundryFolder>,
): Array<{ path: string; content: string }> {
  const subtreeIds = collectSubtreeIds(rootFolder.id, folderById);
  const files: Array<{ path: string; content: string }> = [];

  for (const j of game.journal as Iterable<FoundryJournal>) {
    const folderId = j.folder?.id;
    if (!folderId || !subtreeIds.has(folderId)) continue;

    const subSegments = relativePathSegments(folderId, rootFolder.id, folderById);
    const filePath = [
      EXPORT_BASE,
      safeName(rootFolder.name),
      ...subSegments,
      `${safeName(j.name)}.md`,
    ].join("/");

    files.push({ path: filePath, content: journalToMarkdown(j) });
  }

  return files;
}

async function commitChunk(
  files: { path: string; content: string }[],
  message: string,
  deletePaths?: string[],
): Promise<string> {
  const result = await postBackend<{ commitUrl?: string }>("v1/backup/github/lore-files", {
    files,
    deletePaths: deletePaths ?? [],
    commitMessage: message,
    repoRoot: REPO_ROOT,
  });
  return result.commitUrl ?? "";
}

async function listGitHubPaths(prefix: string): Promise<string[]> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) return [];
  const url = `${buildBackendUrl(settings.backendUrl, "v1/backup/github/list-paths")}?repoRoot=${encodeURIComponent(REPO_ROOT)}&prefix=${encodeURIComponent(prefix)}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${settings.clientToken}` },
  });
  if (!response.ok) return [];
  const data = await response.json() as { paths?: string[] };
  return Array.isArray(data.paths) ? data.paths : [];
}

// ---------------------------------------------------------------------------
// UI entry point
// ---------------------------------------------------------------------------

export async function runExportCCJournals(): Promise<void> {
  requireFoundryGm("runExportCCJournals");

  const folderById = buildFolderMap([]);
  const ccRootFolders = getCCRootFolders(folderById);

  const sessionFolderName = getLoreBridgeSettings().sessionLogFolder || "Session Logs";
  let sessionPages: { path: string; content: string }[] = [];
  for (const j of game.journal as Iterable<FoundryJournal>) {
    if ((j.name ?? "").trim().toLowerCase() !== sessionFolderName.trim().toLowerCase()) continue;
    for (const page of j.pages) {
      if (!page.name) continue;
      sessionPages.push({
        path: `${EXPORT_BASE}/${safeName(sessionFolderName)}/${safeName(page.name)}.md`,
        content: pageToMarkdown(page),
      });
    }
    break;
  }

  // Pre-gather and chunk so the total step count is accurate up front.
  type WorkItem = { label: string; commitLabel: string; files: { path: string; content: string }[] };
  const work: WorkItem[] = [];

  for (const folder of ccRootFolders) {
    const files = journalsInSubtree(folder, folderById);
    if (files.length === 0) continue;
    const chunks = chunkArray(files, CHUNK_SIZE);
    chunks.forEach((chunk, i) => {
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      work.push({
        label: `${folder.name}${partLabel}`,
        commitLabel: `Export ${folder.name}${partLabel}`,
        files: chunk,
      });
    });
  }

  if (sessionPages.length > 0) {
    const chunks = chunkArray(sessionPages, CHUNK_SIZE);
    chunks.forEach((chunk, i) => {
      const partLabel = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
      work.push({
        label: `${sessionFolderName}${partLabel}`,
        commitLabel: `Export ${sessionFolderName}${partLabel}`,
        files: chunk,
      });
    });
  }

  if (work.length === 0) {
    ui.notifications.warn("LoreBridge CC Export: Nothing to export.");
    return;
  }

  // Gather current GitHub paths before committing so we can compute deletions.
  ui.notifications.info("LoreBridge CC Export: checking GitHub for stale files…");
  const githubPaths = await listGitHubPaths(EXPORT_BASE).catch(() => [] as string[]);
  const newPathSet = new Set(work.flatMap((w) => w.files.map((f) => f.path)));
  const deletions = githubPaths.filter((p) => !newPathSet.has(p));

  let totalFiles = 0;
  let lastCommitUrl = "";

  // Track per-folder totals for the result dialog.
  const folderTotals = new Map<string, number>();

  try {
    for (let i = 0; i < work.length; i++) {
      const item = work[i]!;
      ui.notifications.info(`LoreBridge CC Export: ${item.label} (${i + 1}/${work.length})…`);
      lastCommitUrl = await commitChunk(item.files, item.commitLabel);
      totalFiles += item.files.length;

      // Attribute files back to their CC root folder name for the summary.
      for (const f of item.files) {
        const seg = f.path.split("/")[1] ?? item.label;
        folderTotals.set(seg, (folderTotals.get(seg) ?? 0) + 1);
      }
    }

    // Cleanup commit: delete any files on GitHub that are no longer in Foundry.
    if (deletions.length > 0) {
      ui.notifications.info(`LoreBridge CC Export: removing ${deletions.length} deleted file${deletions.length !== 1 ? "s" : ""}…`);
      lastCommitUrl = await commitChunk([], `Sync: remove ${deletions.length} deleted journal${deletions.length !== 1 ? "s" : ""}`, deletions);
    }

    const rowsHtml = Array.from(folderTotals.entries())
      .map(([name, count]) => `<tr><td>${escHtml(name)}</td><td style="text-align:center">${count}</td></tr>`)
      .join("");

    const deletionNote = deletions.length > 0
      ? `<p style="margin-top:0.25rem;color:#888;font-size:0.9em">${deletions.length} deleted file${deletions.length !== 1 ? "s" : ""} removed from GitHub.</p>`
      : "";

    const linkHtml = lastCommitUrl
      ? `<p style="margin-top:0.5rem"><a href="${escHtml(lastCommitUrl)}" target="_blank" rel="noopener noreferrer">View last commit on GitHub</a></p>`
      : "";

    showResultDialog(
      "Campaign Codex Export",
      `<p><strong>${totalFiles}</strong> file${totalFiles !== 1 ? "s" : ""} exported to <code>sources/campaign codex/</code>.</p>
<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;font-size:0.9em">
  <thead><tr><th style="text-align:left;padding:2px 6px">Folder</th><th style="padding:2px 6px">Files</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>${deletionNote}${linkHtml}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ui.notifications.error(`LoreBridge CC Export: ${msg}`);
  }
}
