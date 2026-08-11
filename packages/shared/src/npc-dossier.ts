/**
 * NPC Dossier shared types.
 *
 * The NpcDossierData model is used by the Campaign Codex NPC Dossier widget
 * (foundry-module) and the backend dossier normalization layer. Types live
 * here so both packages can reference them without a cross-package runtime
 * dependency.
 */

export type NpcDossierGoal = {
  id: string;
  goal: string;
  questReference: string;
};

export type NpcDossierConditional = {
  id: string;
  trigger: string;
  response: string;
  consequence: string;
  relatedUuid: string;
  visibility: "normal" | "conditional" | "secret";
};

export type NpcDossierQa = {
  id: string;
  question: string;
  answer: string;
  visibility: "normal" | "conditional" | "secret";
  relatedSourceUuid: string;
};

export type NpcDossierKnowledge = {
  id: string;
  statement: string;
  topicOrCategory: string;
  quality: "knows" | "believes" | "rumor" | "mistaken";
  sourceUuid: string;
};

export type NpcDossierData = {
  schemaVersion: 1;
  reference: {
    nicknames: string;
    sourceBook: string;
    sourcePage: string;
    mapReference: string;
    statBlockReference: string;
    statBlockAlterations: string;
  };
  identity: {
    sexOrGender: string;
    race: string;
    age: string;
    alignment: string;
    height: string;
    weight: string;
    eyes: string;
    hair: string;
    occupationOrClass: string;
    distinguishingFeatures: string;
  };
  overview: {
    bullets: string[];
    familyNotes: string;
    friends: string;
    otherAcquaintances: string;
    relationshipNotes: string;
    secretsNarrative: string;
  };
  roleplay: {
    firstImpression: string;
    personalityAndDemeanor: string;
    voiceOrSpeech: string;
    conversationalApproach: string;
    runningTheNpc: string;
    goals: NpcDossierGoal[];
  };
  conditionalInfo: NpcDossierConditional[];
  qa: NpcDossierQa[];
  knowledge: NpcDossierKnowledge[];
};
