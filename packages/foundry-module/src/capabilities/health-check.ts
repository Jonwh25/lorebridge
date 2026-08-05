import {
  validateCheckCampaignHealthInput,
  validateCheckCampaignHealthOutput,
  ALL_HEALTH_CHECK_CATEGORIES,
  type CheckCampaignHealthInput,
  type CheckCampaignHealthOutput,
  type HealthCheckCategory,
  type HealthFinding,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";

const DEFAULT_LIMIT = 100;
const UUID_LINK_RE = /@UUID\[([^\]]+)\]/g;
const UUID_LINK_CAP = 50;

function extractUuidLinks(html: string): string[] {
  const uuids: string[] = [];
  let match: RegExpExecArray | null;
  UUID_LINK_RE.lastIndex = 0;
  while ((match = UUID_LINK_RE.exec(html)) !== null && uuids.length < UUID_LINK_CAP) {
    const raw = match[1];
    if (raw) uuids.push(raw.split("{")[0]?.trim() ?? raw);
  }
  return uuids;
}

// Returns false if the UUID references a supported doc type that doesn't exist.
// Returns true for unknown doc types (avoids false positives on compendium UUIDs etc.).
function resolveUuidExists(uuid: string): boolean {
  const parts = uuid.split(".");
  try {
    if (parts[0] === "Actor" && parts[1]) return !!game.actors?.get(parts[1]);
    if (parts[0] === "JournalEntry" && parts[1]) {
      const journal = game.journal?.get(parts[1]);
      if (!journal) return false;
      if (parts[2] === "JournalEntryPage" && parts[3]) return !!journal.pages.get(parts[3]);
      return true;
    }
    if (parts[0] === "Scene" && parts[1]) return !!game.scenes?.get(parts[1]);
    if (parts[0] === "Item" && parts[1]) return !!game.items?.get(parts[1]);
    if (parts[0] === "RollTable" && parts[1]) return !!game.tables?.get(parts[1]);
    if (parts[0] === "Macro" && parts[1]) return !!game.macros?.get(parts[1]);
  } catch {
    // Unknown or unavailable — don't false-positive
  }
  return true;
}

function isUuidPlayerVisible(uuid: string): boolean {
  const parts = uuid.split(".");
  try {
    if (parts[0] === "Actor" && parts[1]) return isPlayerVisible(game.actors?.get(parts[1])?.ownership);
    if (parts[0] === "JournalEntry" && parts[1]) return isPlayerVisible(game.journal?.get(parts[1])?.ownership);
    if (parts[0] === "Scene" && parts[1]) return isPlayerVisible(game.scenes?.get(parts[1])?.ownership);
  } catch {
    // Unknown type — default to not player-visible (safer)
  }
  return false;
}

function actorBiographyHtml(actor: FoundryActor): string {
  const system = actor.system;
  const paths = [["details", "biography"], ["biography"], ["description"], ["details", "description"]];
  for (const path of paths) {
    let node: unknown = system;
    for (const key of path) node = (node as Record<string, unknown>)?.[key];
    const text = (node as Record<string, unknown>)?.value ?? (node as Record<string, unknown>)?.public ?? node;
    if (typeof text === "string" && text.length > 0) return text;
  }
  return "";
}

function isModuleAssetMissing(imgPath: string): string | null {
  if (!imgPath.startsWith("modules/")) return null;
  const moduleName = imgPath.split("/")[1];
  if (!moduleName) return null;
  const mod = game.modules?.get(moduleName);
  if (!mod || !mod.active) return `module '${moduleName}' is not installed or active`;
  return null;
}

function checkBrokenLinks(
  findings: HealthFinding[],
  limit: number,
  scanned: { count: number },
): void {
  for (const journal of game.journal ?? []) {
    for (const page of journal.pages) {
      if (findings.length >= limit) return;
      scanned.count++;
      const html = page.text?.content ?? "";
      if (!html) continue;
      for (const uuid of extractUuidLinks(html)) {
        if (findings.length >= limit) return;
        if (!resolveUuidExists(uuid)) {
          findings.push({
            category: "broken-link",
            severity: "error",
            sourceUuid: `JournalEntry.${journal.id}.JournalEntryPage.${page.id}`,
            sourceName: `${journal.name} → ${page.name}`,
            targetUuid: uuid,
            detail: `Broken @UUID link to missing document: ${uuid}`,
          });
        }
      }
    }
  }

  for (const actor of game.actors ?? []) {
    if (findings.length >= limit) return;
    scanned.count++;
    const html = actorBiographyHtml(actor);
    if (!html) continue;
    for (const uuid of extractUuidLinks(html)) {
      if (findings.length >= limit) return;
      if (!resolveUuidExists(uuid)) {
        findings.push({
          category: "broken-link",
          severity: "error",
          sourceUuid: `Actor.${actor.id}`,
          sourceName: actor.name,
          targetUuid: uuid,
          detail: `Broken @UUID link to missing document: ${uuid}`,
        });
      }
    }
  }
}

function checkMissingAssets(
  findings: HealthFinding[],
  limit: number,
  scanned: { count: number },
): void {
  for (const actor of game.actors ?? []) {
    if (findings.length >= limit) return;
    scanned.count++;
    const img = actor.img ?? "";
    if (img === "") {
      findings.push({
        category: "missing-asset",
        severity: "warning",
        sourceUuid: `Actor.${actor.id}`,
        sourceName: actor.name,
        detail: "Actor has no image path configured",
      });
    } else {
      const issue = isModuleAssetMissing(img);
      if (issue) {
        findings.push({
          category: "missing-asset",
          severity: "error",
          sourceUuid: `Actor.${actor.id}`,
          sourceName: actor.name,
          detail: `Actor image references unavailable asset (${issue}): ${img}`,
        });
      }
    }
  }

  for (const scene of game.scenes ?? []) {
    if (findings.length >= limit) return;
    scanned.count++;
    const bg =
      scene.firstLevel?.background?.src ??
      scene.background?.src ??
      "";
    if (bg === "") {
      findings.push({
        category: "missing-asset",
        severity: "warning",
        sourceUuid: `Scene.${scene.id}`,
        sourceName: scene.name,
        detail: "Scene has no background image configured",
      });
    } else {
      const issue = isModuleAssetMissing(bg);
      if (issue) {
        findings.push({
          category: "missing-asset",
          severity: "error",
          sourceUuid: `Scene.${scene.id}`,
          sourceName: scene.name,
          detail: `Scene background references unavailable asset (${issue}): ${bg}`,
        });
      }
    }
  }
}

function checkPermissionExposure(
  findings: HealthFinding[],
  limit: number,
  scanned: { count: number },
): void {
  for (const journal of game.journal ?? []) {
    if (!isPlayerVisible(journal.ownership)) continue;
    for (const page of journal.pages) {
      if (findings.length >= limit) return;
      scanned.count++;
      const html = page.text?.content ?? "";
      if (!html) continue;
      for (const uuid of extractUuidLinks(html)) {
        if (findings.length >= limit) return;
        if (!resolveUuidExists(uuid)) continue; // broken-link check handles this
        if (!isUuidPlayerVisible(uuid)) {
          findings.push({
            category: "permission-exposure",
            severity: "warning",
            sourceUuid: `JournalEntry.${journal.id}.JournalEntryPage.${page.id}`,
            sourceName: `${journal.name} → ${page.name}`,
            targetUuid: uuid,
            detail: `Player-visible page links to GM-only document: ${uuid}`,
          });
        }
      }
    }
  }
}

function checkDuplicateNames(
  findings: HealthFinding[],
  limit: number,
  scanned: { count: number },
): void {
  type NameEntry = { uuid: string; name: string };

  function findDuplicates(
    docs: NameEntry[],
    typeName: string,
  ): void {
    const seen = new Map<string, NameEntry>();
    const reported = new Set<string>();
    for (const doc of docs) {
      scanned.count++;
      const key = doc.name.trim().toLowerCase();
      if (!key) continue;
      const prior = seen.get(key);
      if (prior) {
        if (!reported.has(prior.uuid) && findings.length < limit) {
          findings.push({
            category: "duplicate-name",
            severity: "warning",
            sourceUuid: prior.uuid,
            sourceName: prior.name,
            detail: `Duplicate ${typeName} name '${prior.name}' also used by ${doc.uuid}`,
          });
          reported.add(prior.uuid);
        }
        if (findings.length < limit) {
          findings.push({
            category: "duplicate-name",
            severity: "warning",
            sourceUuid: doc.uuid,
            sourceName: doc.name,
            detail: `Duplicate ${typeName} name '${doc.name}' also used by ${prior.uuid}`,
          });
          reported.add(doc.uuid);
        }
      } else {
        seen.set(key, doc);
      }
    }
  }

  findDuplicates(
    Array.from(game.actors ?? []).map((a) => ({ uuid: `Actor.${a.id}`, name: a.name })),
    "actor",
  );
  findDuplicates(
    Array.from(game.journal ?? []).map((j) => ({ uuid: `JournalEntry.${j.id}`, name: j.name })),
    "journal",
  );
  findDuplicates(
    Array.from(game.scenes ?? []).map((s) => ({ uuid: `Scene.${s.id}`, name: s.name })),
    "scene",
  );
}

function checkEmptyFolders(
  findings: HealthFinding[],
  limit: number,
  scanned: { count: number },
): void {
  const populatedIds = new Set<string>();

  for (const actor of game.actors ?? []) {
    if (actor.folder?.id) populatedIds.add(actor.folder.id);
  }
  for (const journal of game.journal ?? []) {
    const j = journal as unknown as { folder?: { id: string } | null };
    if (j.folder?.id) populatedIds.add(j.folder.id);
  }
  for (const scene of game.scenes ?? []) {
    if (scene.folder?.id) populatedIds.add(scene.folder.id);
  }
  for (const item of game.items ?? []) {
    const it = item as unknown as { folder?: { id: string } | null };
    if (it.folder?.id) populatedIds.add(it.folder.id);
  }
  // A folder that contains subfolders is not empty
  for (const folder of game.folders ?? []) {
    if (folder.folder?.id) populatedIds.add(folder.folder.id);
  }

  for (const folder of game.folders ?? []) {
    if (findings.length >= limit) return;
    scanned.count++;
    if (!populatedIds.has(folder.id)) {
      findings.push({
        category: "empty-folder",
        severity: "warning",
        sourceUuid: `Folder.${folder.id}`,
        sourceName: folder.name,
        detail: `Empty folder '${folder.name}' (type: ${folder.type})`,
      });
    }
  }
}

export function checkCampaignHealth(input: CheckCampaignHealthInput): CheckCampaignHealthOutput {
  requireFoundryGm("checkCampaignHealth");
  const validated = validateCheckCampaignHealthInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Campaign health check input is invalid.", {
      details: { validationErrors: validated.errors },
    });
  }

  if (!game.world) {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  }

  const {
    checks = ALL_HEALTH_CHECK_CATEGORIES,
    limit = DEFAULT_LIMIT,
  } = validated.value;

  const findings: HealthFinding[] = [];
  const checksRun: HealthCheckCategory[] = [];
  const scanned = { count: 0 };

  for (const check of checks) {
    if (findings.length >= limit) break;
    try {
      if (check === "broken-link") checkBrokenLinks(findings, limit, scanned);
      else if (check === "missing-asset") checkMissingAssets(findings, limit, scanned);
      else if (check === "permission-exposure") checkPermissionExposure(findings, limit, scanned);
      else if (check === "duplicate-name") checkDuplicateNames(findings, limit, scanned);
      else if (check === "empty-folder") checkEmptyFolders(findings, limit, scanned);
      checksRun.push(check);
    } catch (err) {
      console.warn(`LoreBridge | Health check '${check}' failed:`, err);
    }
  }

  const output: CheckCampaignHealthOutput = {
    sourceId: `foundry:${game.world.id}`,
    sourceName: game.world.title,
    findings: findings.slice(0, limit),
    checksRun,
    documentsScanned: scanned.count,
    truncated: findings.length >= limit,
  };

  const outputValidation = validateCheckCampaignHealthOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Campaign health check produced invalid output.", {
      details: { validationErrors: outputValidation.errors },
    });
  }
  return outputValidation.value;
}
