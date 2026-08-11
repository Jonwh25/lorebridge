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

export type NpcDossierRelationship = {
  id: string;
  name: string;
  description: string;
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

export type NpcDossierSecret = {
  id: string;
  heading: string;
  text: string;
};

export type NpcDossierData = {
  schemaVersion: 1;
  /** Reference / Info tab — source and discovery data */
  reference: {
    nicknames: string;
    sourceBook: string;
    sourcePage: string;
    statBlockReference: string;
    statBlockAlterations: string;
    discoveryRegion: string;
    discoveryLocation: string;
  };
  /** Identity / Info tab — physical and biographical facts */
  identity: {
    occupationOrClass: string;
    race: string;
    sexOrGender: string;
    age: string;
    alignment: string;
    height: string;
    weight: string;
    eyes: string;
    hair: string;
    appearance: string;
  };
  /** Overview / Profile tab — summary, relationships, GM secrets */
  overview: {
    playerKnowledgeTitle: string;
    playerKnowledge: string;
    profileTagline: string;
    bullets: string[];
    relationships: NpcDossierRelationship[];
    secretsNarrative: string;
    secrets: NpcDossierSecret[];
  };
  /** Roleplay tab — how to run this NPC at the table */
  roleplay: {
    tagline: string;
    firstImpression: string;
    personality: string;
    motivation: string;
    fear: string;
    mannerisms: string;
    voiceOrSpeech: string;
    conversationalApproach: string;
    atTheTable: string;
    goals: NpcDossierGoal[];
  };
  conditionalInfo: NpcDossierConditional[];
  qa: NpcDossierQa[];
  knowledge: NpcDossierKnowledge[];
  knowledgeLimits: string;
};
