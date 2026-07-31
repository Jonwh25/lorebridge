import {
  validateGetRelatedDocumentsInput,
  validateGetRelatedDocumentsOutput,
  type GetRelatedDocumentsInput,
  type GetRelatedDocumentsOutput,
  type RelatedDocument,
  type RelationshipType,
  type ResolvedDocumentType,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";
import { getActor } from "./actors.js";
import { getJournal, getJournalPage } from "./journals.js";
import { getScene } from "./scenes.js";

function actorHtml(actorId: string): string {
  const actor = game.actors?.get(actorId);
  if (!actor) return "";
  const system = actor.system as Record<string, unknown>;
  const paths = [["details", "biography"], ["biography"], ["description"], ["details", "description"]];
  for (const path of paths) {
    let node: unknown = system;
    for (const key of path) {
      node = (node as Record<string, unknown>)?.[key];
    }
    const text = (node as Record<string, unknown>)?.value ?? (node as Record<string, unknown>)?.public ?? node;
    if (typeof text === "string" && text.length > 0) return text;
  }
  return "";
}

const DEFAULT_LIMIT = 20;
const UUID_LINK_CAP = 20;

// Matches @UUID[Actor.abc123], @UUID[JournalEntry.abc123.JournalEntryPage.def456], etc.
const UUID_LINK_RE = /@UUID\[([^\]]+)\]/g;

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

function documentTypeFromUuid(uuid: string): ResolvedDocumentType | null {
  const parts = uuid.split(".");
  if (parts[0] === "Actor" && parts[1]) return "actor";
  if (parts[0] === "JournalEntry" && parts[2] === "JournalEntryPage" && parts[3]) return "journalPage";
  if (parts[0] === "JournalEntry" && parts[1]) return "journal";
  if (parts[0] === "Scene" && parts[1]) return "scene";
  return null;
}

function nameForUuid(uuid: string): string | null {
  try {
    const parts = uuid.split(".");
    if (parts[0] === "Actor" && parts[1]) {
      return game.actors?.get(parts[1])?.name ?? null;
    }
    if (parts[0] === "JournalEntry" && parts[1]) {
      const journal = game.journal?.get(parts[1]);
      if (!journal) return null;
      if (parts[2] === "JournalEntryPage" && parts[3]) {
        return journal.pages.get(parts[3])?.name ?? null;
      }
      return journal.name;
    }
    if (parts[0] === "Scene" && parts[1]) {
      return game.scenes?.get(parts[1])?.name ?? null;
    }
  } catch {
    // Not available; skip
  }
  return null;
}

function sourceId(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return `foundry:${game.world.id}`;
}

function sourceName(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return game.world.title;
}

function ownershipForUuid(uuid: string): Record<string, number> | undefined {
  const parts = uuid.split(".");
  if (parts[0] === "Actor" && parts[1]) return game.actors?.get(parts[1])?.ownership;
  if (parts[0] === "JournalEntry" && parts[1]) return game.journal?.get(parts[1])?.ownership;
  if (parts[0] === "Scene" && parts[1]) return game.scenes?.get(parts[1])?.ownership;
  return undefined;
}

function addRelated(
  map: Map<string, RelatedDocument>,
  uuid: string,
  relationshipType: RelationshipType,
  allowedTypes: ResolvedDocumentType[],
  playerMode: boolean,
): void {
  if (map.has(uuid)) return;
  const documentType = documentTypeFromUuid(uuid);
  if (!documentType || !allowedTypes.includes(documentType)) return;
  if (playerMode && !isPlayerVisible(ownershipForUuid(uuid))) return;
  const name = nameForUuid(uuid);
  if (!name) return;
  map.set(uuid, { uuid, documentType, name, relationshipType });
}

function collectFromHtml(
  html: string,
  map: Map<string, RelatedDocument>,
  allowedTypes: ResolvedDocumentType[],
  playerMode: boolean,
): void {
  for (const uuid of extractUuidLinks(html)) {
    addRelated(map, uuid, "uuidLink", allowedTypes, playerMode);
  }
}

interface SourceDocument {
  documentType: ResolvedDocumentType;
  name: string;
  html: string;
  sceneOutput?: ReturnType<typeof getScene>;
}

function resolveSourceDocument(uuid: string): SourceDocument {
  const parts = uuid.split(".");
  if (parts[0] === "Actor" && parts[1]) {
    const actorId = parts[1];
    const doc = getActor({ actorId });
    return { documentType: "actor", name: doc.name, html: actorHtml(actorId) };
  }
  if (parts[0] === "JournalEntry" && parts[1] && parts[2] === "JournalEntryPage" && parts[3]) {
    const doc = getJournalPage({ journalId: parts[1], pageId: parts[3] });
    return { documentType: "journalPage", name: doc.page.name, html: doc.page.text?.html ?? "" };
  }
  if (parts[0] === "JournalEntry" && parts[1]) {
    const doc = getJournal({ journalId: parts[1] });
    const allHtml = doc.pages.map((p) => p.text?.html ?? "").join("\n");
    return { documentType: "journal", name: doc.name, html: allHtml };
  }
  if (parts[0] === "Scene" && parts[1]) {
    const doc = getScene({ sceneId: parts[1] });
    return { documentType: "scene", name: doc.name, html: "", sceneOutput: doc };
  }
  throw new LoreBridgeCapabilityError(
    "INVALID_REQUEST",
    `UUID document type '${parts[0] ?? uuid}' is not supported. Supported types: Actor, JournalEntry, Scene.`,
  );
}

export function getRelatedDocuments(input: GetRelatedDocumentsInput): GetRelatedDocumentsOutput {
  requireFoundryGm("getRelatedDocuments");
  const validated = validateGetRelatedDocumentsInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Related documents input is invalid.", { details: { validationErrors: validated.errors } });
  }

  const { uuid, limit = DEFAULT_LIMIT, types = ["actor", "journal", "journalPage", "scene"], mode } = validated.value;
  const trimmedUuid = uuid.trim();
  const playerMode = mode === "player";

  const source = resolveSourceDocument(trimmedUuid);
  const related = new Map<string, RelatedDocument>();

  if (source.html) {
    collectFromHtml(source.html, related, types, playerMode);
  }

  if (source.sceneOutput) {
    const scene = source.sceneOutput;

    if (scene.linkedJournal) {
      const journalUuid = scene.linkedJournal.pageUuid ?? scene.linkedJournal.uuid;
      const journalDocType: ResolvedDocumentType = scene.linkedJournal.pageUuid ? "journalPage" : "journal";
      const journalName = scene.linkedJournal.pageName ?? scene.linkedJournal.name;
      if (types.includes(journalDocType) && !related.has(journalUuid)) {
        const ownerId = scene.linkedJournal.id;
        const ownership = game.journal?.get(ownerId)?.ownership;
        if (!playerMode || isPlayerVisible(ownership)) {
          related.set(journalUuid, { uuid: journalUuid, documentType: journalDocType, name: journalName, relationshipType: "sceneLinkedJournal" });
        }
      }
    }

    for (const note of scene.notes ?? []) {
      if (!note.journalUuid) continue;
      const noteUuid = note.pageUuid ?? note.journalUuid;
      const noteDocType: ResolvedDocumentType = note.pageUuid ? "journalPage" : "journal";
      const noteName = note.pageName ?? note.journalName ?? note.label ?? note.journalId ?? noteUuid;
      if (types.includes(noteDocType) && !related.has(noteUuid)) {
        const ownership = note.journalId ? game.journal?.get(note.journalId)?.ownership : undefined;
        if (!playerMode || isPlayerVisible(ownership)) {
          related.set(noteUuid, { uuid: noteUuid, documentType: noteDocType, name: noteName, relationshipType: "sceneNote" });
        }
      }
    }

    for (const token of scene.tokens ?? []) {
      if (!token.actorUuid) continue;
      if (types.includes("actor") && !related.has(token.actorUuid)) {
        const actorId = token.actorId;
        const ownership = actorId ? game.actors?.get(actorId)?.ownership : undefined;
        if (!playerMode || isPlayerVisible(ownership)) {
          related.set(token.actorUuid, { uuid: token.actorUuid, documentType: "actor", name: token.name, relationshipType: "sceneToken" });
        }
      }
    }
  }

  const output: GetRelatedDocumentsOutput = {
    sourceId: sourceId(),
    sourceName: sourceName(),
    uuid: trimmedUuid,
    documentType: source.documentType,
    name: source.name,
    related: Array.from(related.values()).slice(0, limit),
  };

  const outputValidation = validateGetRelatedDocumentsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned invalid related documents.", { details: { validationErrors: outputValidation.errors } });
  }
  return outputValidation.value;
}
