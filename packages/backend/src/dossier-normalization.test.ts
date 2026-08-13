import assert from "node:assert/strict";
import test from "node:test";
import {
  isNpcDossierData,
  migrateDossierData,
  normalizeDossierToContext,
  stripSecrets,
  DOSSIER_PROVENANCE,
} from "./dossier-normalization.js";
import type { NpcDossierData } from "@lorebridge/shared";

// ---------------------------------------------------------------------------
// Ismark test fixture
// ---------------------------------------------------------------------------

const ISMARK_FIXTURE: NpcDossierData = {
  schemaVersion: 1,
  reference: {
    nicknames: "Ismark the Lesser",
    status: "Alive",
    killedBy: "",
    killedInSession: 0,
    sourceBook: "Curse of Strahd",
    sourcePage: "43",
    discoveryRegion: "Village of Barovia",
    discoveryLocation: "Blood of the Vine Tavern",
    statBlockReference: "Veteran",
    statBlockAlterations: "Add Persuasion +4, History +4",
  },
  identity: {
    occupationOrClass: "Burgomaster's son / Fighter",
    race: "Human (Barovian)",
    sexOrGender: "Male",
    age: "30s",
    alignment: "Neutral Good",
    height: "5'11\"",
    weight: "Lean, athletic build",
    eyes: "Brown",
    hair: "Dark brown, unkempt",
    appearance: "Haunted look, dark circles under eyes",
  },
  overview: {
    playerKnowledgeTitle: "About Ismark",
    playerKnowledge: "Son of the late Burgomaster. Seeks help escorting his sister Ireena to safety.",
    profileTagline: "A burdened son carrying responsibilities he never asked for.",
    bullets: [
      "Son of the late Burgomaster Kolyan Indirovich of the Village of Barovia.",
      "Seeks to escort his sister Ireena to safety outside Strahd's reach.",
      "Considers himself unworthy of the title 'the Greater' like his ancestor.",
      "Deeply loyal despite his fear of Strahd.",
    ],
    relationships: [
      { id: "r1", name: "Ireena Kolyana", description: "Sister. Protective of her above all else. Adopted — see GM secrets." },
      { id: "r2", name: "Kolyan Indirovich", description: "Father (deceased). Father Donavich (estranged)." },
    ],
    secretsNarrative:
      '<section class="secret">Ireena is adopted; Ismark learned this shortly before Kolyan died. ' +
      "He has not told Ireena and fears she will be devastated.</section>",
    secrets: [],
  },
  roleplay: {
    tagline: "An honest, exhausted ally who still chooses hope.",
    firstImpression: "Exhausted, slightly disheveled man who nonetheless carries himself with quiet authority.",
    personality: "Self-deprecating but earnest. Takes responsibility seriously even when overwhelmed.",
    motivation: "Escort Ireena to safety and give his father a proper burial.",
    fear: "Failing Ireena or being unable to protect those who depend on him.",
    mannerisms: "Quiet pauses when worried. Flinches at mention of Strahd.",
    voiceOrSpeech: "Measured, slightly formal. Speaks more quietly when worried.",
    conversationalApproach: "Open with strangers who seem trustworthy. Deflects personal questions with practicalities.",
    atTheTable: "Lead with Ireena's safety as his primary concern. Let guilt show when pressed.",
    goals: [
      { id: "g1", goal: "Escort Ireena to Vallaki or beyond.", questReference: "" },
      { id: "g2", goal: "Bury his father in consecrated ground.", questReference: "" },
    ],
  },
  knowledgeLimits: "Does not know the true nature of the mists or Strahd's deeper plans.",
  conditionalInfo: [
    {
      id: "c1",
      trigger: "Party mentions the mysterious letter",
      response: "Ismark recognizes it as his father's handwriting. Confirms the plea for help is genuine.",
      consequence: "Reveals the letter was sent months ago; Kolyan died waiting.",
      relatedUuid: "",
      visibility: "normal",
    },
    {
      id: "c2",
      trigger: "Party asks about Lancelot",
      response: "A dog that appeared at the manor recently. Ismark allowed it to stay because Ireena smiled for the first time in weeks.",
      consequence: "",
      relatedUuid: "",
      visibility: "normal",
    },
  ],
  qa: [
    {
      id: "q1",
      question: "How do we escape Barovia?",
      answer: "I wish I knew. The mists keep everyone in. Vallaki is said to be safer — that is where I must take Ireena.",
      visibility: "normal",
      relatedSourceUuid: "",
    },
    {
      id: "q2",
      question: "What happened to your father?",
      answer: "He died of grief — or perhaps fear. Strahd's attacks on the manor broke him. I… could not protect him.",
      visibility: "normal",
      relatedSourceUuid: "",
    },
    {
      id: "q3",
      question: "Is Ireena really Strahd's target?",
      answer: "I will not speak of that to strangers.",
      visibility: "secret",
      relatedSourceUuid: "",
    },
  ],
  knowledge: [
    {
      id: "k1",
      statement: "Strahd has attacked the Indirovich manor multiple times, seeking Ireena.",
      topicOrCategory: "Barovian Lore",
      quality: "knows",
      sourceUuid: "",
    },
    {
      id: "k2",
      statement: "The Vistani can sometimes move through the mists freely.",
      topicOrCategory: "Barovian Lore",
      quality: "believes",
      sourceUuid: "",
    },
  ],
};

// ---------------------------------------------------------------------------
// isNpcDossierData
// ---------------------------------------------------------------------------

test("isNpcDossierData accepts valid schemaVersion 1 object", () => {
  assert.equal(isNpcDossierData(ISMARK_FIXTURE), true);
});

test("isNpcDossierData rejects null", () => {
  assert.equal(isNpcDossierData(null), false);
});

test("isNpcDossierData accepts valid schemaVersion 2 object", () => {
  assert.equal(isNpcDossierData({ ...ISMARK_FIXTURE, schemaVersion: 2 }), true);
});

test("isNpcDossierData rejects wrong schemaVersion", () => {
  assert.equal(isNpcDossierData({ ...ISMARK_FIXTURE, schemaVersion: 99 }), false);
});

test("isNpcDossierData rejects missing arrays", () => {
  const bad = { ...ISMARK_FIXTURE, conditionalInfo: "not-an-array" };
  assert.equal(isNpcDossierData(bad), false);
});

test("isNpcDossierData rejects missing required objects", () => {
  const { reference: _ref, ...noRef } = ISMARK_FIXTURE;
  assert.equal(isNpcDossierData(noRef), false);
});

// ---------------------------------------------------------------------------
// migrateDossierData
// ---------------------------------------------------------------------------

test("migrateDossierData migrates schemaVersion 1 to 2", () => {
  const result = migrateDossierData(ISMARK_FIXTURE);
  assert.equal(result?.schemaVersion, 2);
  assert.equal(result?.reference.killedBy, "");
  assert.equal(result?.reference.killedInSession, 0);
});

test("migrateDossierData returns schemaVersion 2 dossier unchanged", () => {
  const v2 = { ...ISMARK_FIXTURE, schemaVersion: 2 as const };
  assert.deepEqual(migrateDossierData(v2), v2);
});

test("migrateDossierData returns null for unrecognized data", () => {
  assert.equal(migrateDossierData({ foo: "bar" }), null);
  assert.equal(migrateDossierData(null), null);
  assert.equal(migrateDossierData("string"), null);
});

// ---------------------------------------------------------------------------
// DOSSIER_PROVENANCE
// ---------------------------------------------------------------------------

test("DOSSIER_PROVENANCE has expected value", () => {
  assert.equal(DOSSIER_PROVENANCE, "campaign-codex:npc-dossier");
});

// ---------------------------------------------------------------------------
// stripSecrets
// ---------------------------------------------------------------------------

test("stripSecrets removes native Foundry secret blocks", () => {
  const html = 'Before <section class="secret">hidden</section> after';
  assert.equal(stripSecrets(html), "Before  after");
});

test("stripSecrets removes secret blocks with extra classes", () => {
  const html = '<section class="secret revealed">hidden text</section>remaining';
  assert.equal(stripSecrets(html).trim(), "remaining");
});

test("stripSecrets leaves non-secret content intact", () => {
  const html = "<p>Public content</p>";
  assert.equal(stripSecrets(html), "<p>Public content</p>");
});

test("stripSecrets handles multiline secret blocks", () => {
  const html = `Before\n<section class="secret">\n  multi\n  line\n</section>\nAfter`;
  assert.ok(!stripSecrets(html).includes("multi"));
  assert.ok(stripSecrets(html).includes("After"));
});

// ---------------------------------------------------------------------------
// normalizeDossierToContext — GM mode (isGM=true)
// ---------------------------------------------------------------------------

test("normalizeDossierToContext includes reference nicknames", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("Ismark the Lesser"), "should include nicknames");
});

test("normalizeDossierToContext includes identity fields", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("Neutral Good"), "should include alignment");
  assert.ok(ctx.includes("Human (Barovian)"), "should include race");
});

test("normalizeDossierToContext includes overview bullets", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("escort"), "should include an overview bullet");
});

test("normalizeDossierToContext includes roleplay fields", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("Self-deprecating"), "should include personality");
  assert.ok(ctx.includes("Escort Ireena to Vallaki"), "should include goals");
});

test("normalizeDossierToContext includes conditional info triggers", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("mysterious letter"), "should include conditional trigger");
});

test("normalizeDossierToContext includes non-secret Q&A for GM", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("escape Barovia"), "should include Q&A");
});

test("normalizeDossierToContext includes secret Q&A for GM", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("Ireena really Strahd"), "GM should see secret Q&A");
});

test("normalizeDossierToContext includes stripped secrets narrative for GM", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("Ireena is adopted"), "GM should see secrets narrative content");
  assert.ok(!ctx.includes('<section class="secret">'), "should not include raw HTML tags in context");
});

test("normalizeDossierToContext includes knowledge entries", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, true);
  assert.ok(ctx.includes("Barovian Lore"), "should include knowledge category");
  assert.ok(ctx.includes("attacked"), "should include knowledge statement");
});

// ---------------------------------------------------------------------------
// normalizeDossierToContext — player-safe mode (isGM=false)
// ---------------------------------------------------------------------------

test("normalizeDossierToContext excludes secrets narrative for non-GM", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, false);
  assert.ok(!ctx.includes("Ireena is adopted"), "player should not see secrets narrative");
  assert.ok(!ctx.includes("GM Secrets"), "should not include secrets section header for player");
});

test("normalizeDossierToContext excludes secret Q&A entries for non-GM", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, false);
  assert.ok(!ctx.includes("Ireena really Strahd"), "player should not see secret Q&A");
});

test("normalizeDossierToContext includes normal Q&A for non-GM", () => {
  const ctx = normalizeDossierToContext(ISMARK_FIXTURE, false);
  assert.ok(ctx.includes("escape Barovia"), "player should see normal Q&A");
});

// ---------------------------------------------------------------------------
// Bounds: large arrays are truncated
// ---------------------------------------------------------------------------

test("normalizeDossierToContext caps overview bullets at 10", () => {
  const manyBullets: NpcDossierData = {
    ...ISMARK_FIXTURE,
    overview: {
      ...ISMARK_FIXTURE.overview,
      bullets: Array.from({ length: 15 }, (_, i) => `Bullet ${i + 1}`),
    },
  };
  const ctx = normalizeDossierToContext(manyBullets, true);
  assert.ok(ctx.includes("Bullet 10"), "should include bullet 10");
  assert.ok(!ctx.includes("Bullet 11"), "should cap at 10 bullets");
});

test("normalizeDossierToContext caps knowledge at 10 entries", () => {
  const manyKnowledge: NpcDossierData = {
    ...ISMARK_FIXTURE,
    knowledge: Array.from({ length: 12 }, (_, i) => ({
      id: `k${i}`,
      statement: `Fact ${i + 1}`,
      topicOrCategory: "Test",
      quality: "knows" as const,
      sourceUuid: "",
    })),
  };
  const ctx = normalizeDossierToContext(manyKnowledge, true);
  assert.ok(ctx.includes("Fact 10"), "should include fact 10");
  assert.ok(!ctx.includes("Fact 11"), "should cap at 10 knowledge entries");
});

test("normalizeDossierToContext returns empty string for empty dossier", () => {
  const empty: NpcDossierData = {
    schemaVersion: 1,
    reference: { nicknames: "", status: "Alive", killedBy: "", killedInSession: 0, sourceBook: "", sourcePage: "", discoveryRegion: "", discoveryLocation: "", statBlockReference: "", statBlockAlterations: "" },
    identity: { occupationOrClass: "", race: "", sexOrGender: "", age: "", alignment: "", height: "", weight: "", eyes: "", hair: "", appearance: "" },
    overview: { playerKnowledgeTitle: "", playerKnowledge: "", profileTagline: "", bullets: [], relationships: [], secretsNarrative: "", secrets: [] },
    roleplay: { tagline: "", firstImpression: "", personality: "", motivation: "", fear: "", mannerisms: "", voiceOrSpeech: "", conversationalApproach: "", atTheTable: "", goals: [] },
    conditionalInfo: [],
    qa: [],
    knowledge: [],
    knowledgeLimits: "",
  };
  const ctx = normalizeDossierToContext(empty, true);
  assert.equal(ctx, "== Reference ==\nStatus: Alive");
});
