import {
  validateResolveUuidInput,
  validateResolveUuidOutput,
  type ResolveUuidInput,
  type ResolveUuidOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getActor } from "./actors.js";
import { getJournal, getJournalPage } from "./journals.js";
import { getScene } from "./scenes.js";

export function resolveUuid(input: ResolveUuidInput): ResolveUuidOutput {
  requireFoundryGm("resolveUuid");
  const validated = validateResolveUuidInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "UUID resolution input is invalid.", { details: { validationErrors: validated.errors } });
  }

  const uuid = validated.value.uuid.trim();
  const parts = uuid.split(".");

  let output: ResolveUuidOutput;

  if (parts[0] === "Actor" && parts[1]) {
    const document = getActor({ actorId: parts[1] });
    output = { sourceId: document.sourceId, sourceName: document.sourceName, uuid, documentType: "actor", document };
  } else if (parts[0] === "JournalEntry" && parts[1] && parts[2] === "JournalEntryPage" && parts[3]) {
    const document = getJournalPage({ journalId: parts[1], pageId: parts[3] });
    output = { sourceId: document.sourceId, sourceName: document.sourceName, uuid, documentType: "journalPage", document };
  } else if (parts[0] === "JournalEntry" && parts[1]) {
    const document = getJournal({ journalId: parts[1] });
    output = { sourceId: document.sourceId, sourceName: document.sourceName, uuid, documentType: "journal", document };
  } else if (parts[0] === "Scene" && parts[1]) {
    const document = getScene({ sceneId: parts[1] });
    output = { sourceId: document.sourceId, sourceName: document.sourceName, uuid, documentType: "scene", document };
  } else {
    throw new LoreBridgeCapabilityError(
      "INVALID_REQUEST",
      `UUID document type '${parts[0] ?? uuid}' is not supported. Supported types: Actor, JournalEntry, Scene.`,
    );
  }

  const outputValidation = validateResolveUuidOutput(output);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned an invalid resolved document.", { details: { validationErrors: outputValidation.errors } });
  }
  return outputValidation.value;
}
