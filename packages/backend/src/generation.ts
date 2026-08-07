import type {
  BoxedTextLength,
  BoxedTextTone,
  GenerateBoxedTextInput,
  GenerateBoxedTextOutput,
  ConsistencyFinding,
} from "@lorebridge/shared/capabilities";
import type { ProviderService } from "./provider.js";

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

// ---------------------------------------------------------------------------
// Shared AI caller
// ---------------------------------------------------------------------------

async function callAI(provider: ProviderService, prompt: string, maxTokens = 512): Promise<string> {
  if (!provider.enabled) {
    throw new GenerationError("No AI provider is configured on the backend.");
  }
  if (provider.provider === "anthropic") {
    if (!provider.apiKey) throw new GenerationError("Anthropic API key is missing.");
    return callAnthropic(provider.apiKey, prompt, maxTokens);
  }
  if (provider.provider === "openai") {
    if (!provider.apiKey) throw new GenerationError("OpenAI API key is missing.");
    return callOpenAI(provider.apiKey, prompt, maxTokens, provider.baseUrl, provider.model);
  }
  if (provider.provider === "ollama") {
    const baseUrl = provider.baseUrl ?? "http://localhost:11434";
    const model = provider.model ?? "llama3.2";
    return callOpenAI("ollama", prompt, maxTokens, `${baseUrl.replace(/\/$/, "")}/v1`, model);
  }
  throw new GenerationError(`Unsupported provider: ${provider.provider}`);
}

async function callAnthropic(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new GenerationError(`Anthropic API error: ${response.status} ${response.statusText}`);
  }
  const body = await response.json() as { content: Array<{ type: string; text: string }> };
  const text = body.content.find(c => c.type === "text")?.text ?? "";
  if (!text) throw new GenerationError("Anthropic returned no text content.");
  return text.trim();
}

async function callOpenAI(apiKey: string, prompt: string, maxTokens: number, baseUrl?: string, model?: string): Promise<string> {
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/chat/completions`
    : "https://api.openai.com/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model ?? "gpt-4o-mini",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new GenerationError(`OpenAI API error: ${response.status} ${response.statusText}`);
  }
  const body = await response.json() as { choices: Array<{ message: { content: string } }> };
  const text = body.choices[0]?.message?.content ?? "";
  if (!text) throw new GenerationError("OpenAI returned no text content.");
  return text.trim();
}

// ---------------------------------------------------------------------------
// Boxed text (existing)
// ---------------------------------------------------------------------------

const LENGTH_WORDS: Record<BoxedTextLength, string> = {
  short: "2–3 sentences (around 50 words)",
  medium: "4–6 sentences (around 100 words)",
  long: "8–12 sentences (around 200 words)",
};

const TONE_DESCRIPTION: Record<BoxedTextTone, string> = {
  gothic: "dark, atmospheric gothic horror — dread, deep shadows, and quiet foreboding",
  neutral: "clear and vivid, neutral tone suitable for any setting",
  heroic: "epic and inspiring, emphasizing grandeur and the promise of adventure",
  mysterious: "enigmatic and evocative, hinting at hidden truths and the unknown",
};

export async function generateBoxedText(
  provider: ProviderService,
  input: GenerateBoxedTextInput,
): Promise<GenerateBoxedTextOutput> {
  const tone = input.tone ?? "neutral";
  const length = input.length ?? "medium";
  const audience = input.audience ?? "players";
  const audienceNote = audience === "gm"
    ? "This is for the GM's eyes only — not read aloud to players."
    : "This will be read aloud to players at the table.";

  const prompt = [
    "Generate read-aloud descriptive text for a tabletop RPG scene.",
    "",
    `Source document: ${input.documentName} (from ${input.sourceName})`,
    `Tone: ${TONE_DESCRIPTION[tone]}`,
    `Length: ${LENGTH_WORDS[length]}`,
    `Audience: ${audienceNote}`,
    "",
    "Source content:",
    input.content,
    "",
    "Output rules:",
    "- Plain prose only. No markdown, no special characters, no bullet points.",
    "- No | characters, no # characters, no --- dividers.",
    "- Do not include a title, label, or preamble. Start directly with the descriptive text.",
    "- If the source content is sparse or empty, invent a vivid, fitting description based on the document name and tone. Never ask for clarification or more information.",
  ].join("\n");

  const preview = await callAI(provider, prompt, 512);

  return {
    preview,
    sources: [{ name: input.documentName }],
    provider: provider.provider,
    tone,
    length,
  };
}

// ---------------------------------------------------------------------------
// Chat ask — grounded Q&A from campaign context
// ---------------------------------------------------------------------------

export type ChatAskInput = {
  question: string;
  context: Array<{ type: string; name: string; excerpt: string }>;
  worldName: string;
};

export type ChatAskOutput = {
  answer: string;
  provider: string;
};

export async function generateChatAnswer(
  provider: ProviderService,
  input: ChatAskInput,
): Promise<ChatAskOutput> {
  const contextBlock = input.context.length > 0
    ? input.context.map(c => `[${c.type}] ${c.name}:\n${c.excerpt}`).join("\n\n")
    : "No specific campaign documents matched this question.";

  const prompt = [
    `You are a helpful assistant for the GM of a tabletop RPG campaign called "${input.worldName}".`,
    "Answer the GM's question using only the campaign documents provided below.",
    "If the documents don't contain enough information, say so clearly.",
    "Cite the document name when referencing specific information.",
    "Be concise — the GM is at the table.",
    "",
    "Campaign documents:",
    "---",
    contextBlock,
    "---",
    "",
    `GM's question: ${input.question}`,
  ].join("\n");

  const answer = await callAI(provider, prompt, 768);

  return { answer, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// NPC profile generation
// ---------------------------------------------------------------------------

export type NpcProfileInput = {
  name: string;
  type: string;
  biography: string;
  tone: string;
};

export type NpcProfileOutput = {
  personality: string;
  mannerism: string;
  secret: string;
  appearance: string;
  provider: string;
};

export async function generateNpcProfile(
  provider: ProviderService,
  input: NpcProfileInput,
): Promise<NpcProfileOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";

  const prompt = [
    "You are a creative game master assistant helping flesh out an NPC for a tabletop RPG.",
    `Tone: ${toneNote}`,
    "",
    `NPC Name: ${input.name}`,
    `NPC Type: ${input.type}`,
    input.biography ? `Existing biography:\n${input.biography}` : "No biography yet.",
    "",
    "Generate the following — be specific, flavorful, and consistent with any existing biography:",
    "1. PERSONALITY: A 2–3 sentence personality summary.",
    "2. MANNERISM: One specific verbal tic, speech habit, or physical mannerism.",
    "3. SECRET: One secret this NPC holds that the players don't yet know.",
    "4. APPEARANCE: 1–2 sentences describing their visual appearance for a portrait artist — race/species, approximate age, build, hair/skin, clothing style, notable physical features, and overall expression or bearing. Write it as image generation context, not prose.",
    "",
    "Respond in this exact format:",
    "PERSONALITY: <text>",
    "MANNERISM: <text>",
    "SECRET: <text>",
    "APPEARANCE: <text>",
  ].join("\n");

  const raw = await callAI(provider, prompt, 640);

  const personality = raw.match(/PERSONALITY:\s*(.+?)(?=\nMANNERISM:|\n\n|$)/s)?.[1]?.trim() ?? "";
  const mannerism  = raw.match(/MANNERISM:\s*(.+?)(?=\nSECRET:|\n\n|$)/s)?.[1]?.trim() ?? "";
  const secret     = raw.match(/SECRET:\s*(.+?)(?=\nAPPEARANCE:|\n\n|$)/s)?.[1]?.trim() ?? "";
  const appearance = raw.match(/APPEARANCE:\s*(.+?)$/s)?.[1]?.trim() ?? "";

  if (!personality || !mannerism || !secret) {
    throw new GenerationError("AI returned an unexpected format for the NPC profile.");
  }

  return { personality, mannerism, secret, appearance, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// Session recap generation
// ---------------------------------------------------------------------------

export type SessionRecapInput = {
  sessionContent: string;
  sessionName: string;
  tone: string;
  length: string;
};

export type SessionRecapOutput = {
  recap: string;
  provider: string;
};

export async function generateSessionRecap(
  provider: ProviderService,
  input: SessionRecapInput,
): Promise<SessionRecapOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";
  const lengthNote = LENGTH_WORDS[input.length as BoxedTextLength] ?? LENGTH_WORDS.medium;

  const prompt = [
    "You are a creative game master assistant writing a 'story so far' recap for players at the start of a session.",
    `Tone: ${toneNote}`,
    `Length: ${lengthNote}`,
    "",
    `Session: ${input.sessionName}`,
    "",
    "Session notes:",
    "---",
    input.sessionContent,
    "---",
    "",
    "Write a narrative recap suitable for reading aloud at the start of the next session.",
    "Highlight key events, decisions made, and any unresolved cliffhangers.",
    "Write in second person ('You...') to engage the players directly.",
    "Write only the recap itself. Do not include a title or preamble.",
  ].join("\n");

  const recap = await callAI(provider, prompt, 512);

  return { recap, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// Party journal export — player-safe recap (#145)
// ---------------------------------------------------------------------------

export type PartyRecapInput = {
  sessionContent: string;
  sessionName: string;
  tone: string;
  length: string;
  hiddenCount?: number;
};

export type PartyRecapOutput = {
  recap: string;
  provider: string;
};

export async function generatePartyRecap(
  provider: ProviderService,
  input: PartyRecapInput,
): Promise<PartyRecapOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";
  const lengthNote = LENGTH_WORDS[input.length as BoxedTextLength] ?? LENGTH_WORDS.medium;

  const prompt = [
    "You are a creative assistant writing a player-safe session recap for a tabletop RPG campaign.",
    "This recap will be shared with players after the session via Discord or email.",
    `Tone: ${toneNote}`,
    `Length: ${lengthNote}`,
    "",
    `Session: ${input.sessionName}`,
    "",
    "Session notes (may contain GM shorthand — interpret only what the players experienced):",
    "---",
    input.sessionContent,
    "---",
    "",
    "Write a narrative recap of what happened this session from the players' perspective.",
    "Write in third person past tense.",
    "Format using Discord-compatible markdown: use **bold** for character names and key moments, *italics* for emphasis, and blank lines between paragraphs.",
    "Do NOT include any GM-only information, secret roll results, hidden NPC motives, or behind-the-scenes details.",
    "Focus only on events the player characters directly experienced or witnessed.",
    "Write only the recap itself. Do not include a title, preamble, or sign-off.",
  ].join("\n");

  const recap = await callAI(provider, prompt, 600);

  return { recap, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// Scene encounter suggestions (#95)
// ---------------------------------------------------------------------------

export type EncounterSuggestionsInput = {
  sceneName: string;
  linkedJournal?: string;
  tokens: string[];
  tone: string;
};

export type EncounterSuggestionsOutput = {
  suggestions: string[];
  provider: string;
};

export async function generateEncounterSuggestions(
  provider: ProviderService,
  input: EncounterSuggestionsInput,
): Promise<EncounterSuggestionsOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";
  const tokenList = input.tokens.length > 0 ? `Tokens on scene: ${input.tokens.join(", ")}` : "";
  const journalNote = input.linkedJournal ? `Linked journal: ${input.linkedJournal}` : "";

  const prompt = [
    "You are a creative game master assistant generating encounter hooks for a tabletop RPG scene.",
    `Scene: ${input.sceneName}`,
    journalNote,
    tokenList,
    `Tone: ${toneNote}`,
    "",
    "Generate exactly 2-3 distinct encounter hooks or complications appropriate for this scene.",
    "Each suggestion is 1-2 sentences — a specific situation, complication, or event that could occur.",
    "Output rules:",
    "- Plain prose only. No markdown, no | characters, no # characters.",
    "- One suggestion per line, prefixed with a number: 1. 2. 3.",
    "- Start directly with '1.' — no title or preamble.",
    "- Never ask for clarification. Always generate suggestions.",
  ].filter(Boolean).join("\n");

  const raw = await callAI(provider, prompt, 400);

  const suggestions = raw
    .split("\n")
    .map(l => l.replace(/^\d+[.)]\s*/, "").trim())
    .filter(l => l.length > 10);

  return { suggestions, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// Journal page Q&A (#96)
// ---------------------------------------------------------------------------

export type JournalQAInput = {
  question: string;
  pageContent: string;
  pageName: string;
  journalName: string;
};

export type JournalQAOutput = {
  answer: string;
  provider: string;
};

export async function generateJournalAnswer(
  provider: ProviderService,
  input: JournalQAInput,
): Promise<JournalQAOutput> {
  const prompt = [
    `You are answering a GM's question about a specific journal page in their tabletop RPG campaign.`,
    `Journal: ${input.journalName}`,
    `Page: ${input.pageName}`,
    "",
    "Page content:",
    input.pageContent || "(empty page — answer based on the page name only)",
    "",
    `GM's question: ${input.question}`,
    "",
    "Answer based only on the page content above. Be concise and direct — the GM is at the table.",
    "If the page lacks enough information, say so clearly and briefly.",
    "Plain prose only. No markdown, no special characters.",
  ].join("\n");

  const answer = await callAI(provider, prompt, 512);
  return { answer, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// NPC roleplay (#99)
// ---------------------------------------------------------------------------

export type RoleplayInput = {
  actorName: string;
  biography: string;
  personality: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
};

export type RoleplayOutput = {
  response: string;
  provider: string;
};

export async function generateRoleplayResponse(
  provider: ProviderService,
  input: RoleplayInput,
): Promise<RoleplayOutput> {
  const historyText = input.history
    .map(m => `${m.role === "user" ? "GM" : input.actorName}: ${m.content}`)
    .join("\n");

  const prompt = [
    `You are roleplaying as ${input.actorName}, an NPC in a tabletop RPG campaign.`,
    "Stay completely in character. Respond as this character would speak and think.",
    "Be concise — 2-4 sentences unless the situation demands more.",
    "Do not break character, add stage directions, or include narrative descriptions.",
    "Plain prose only. No markdown, no special characters.",
    "",
    "Character background:",
    input.biography || "(no biography provided)",
    input.personality ? `\nPersonality: ${input.personality}` : "",
    historyText ? `\nConversation so far:\n${historyText}` : "",
    "",
    `GM: ${input.message}`,
    `${input.actorName}:`,
  ].filter(l => l !== undefined).join("\n");

  const response = await callAI(provider, prompt, 512);
  return { response, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// Lazy DM Session Prep (#108)
// ---------------------------------------------------------------------------

export type SessionPrepInput = {
  sessionName: string;
  sessionContent: string;
  worldName: string;
  tone: string;
  context: Array<{ type: string; name: string; excerpt: string }>;
};

export type SessionPrepOutput = {
  prep: string;
  provider: string;
};

export async function generateSessionPrep(
  provider: ProviderService,
  input: SessionPrepInput,
): Promise<SessionPrepOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";

  const contextBlock = input.context.length > 0
    ? input.context.map(c => `[${c.type}] ${c.name}: ${c.excerpt}`).join("\n")
    : "No additional campaign context available.";

  const prompt = [
    `You are an expert game master assistant preparing for a tabletop RPG session using the Lazy DM framework from "Return of the Lazy Dungeon Master".`,
    `Campaign world: ${input.worldName}`,
    `Tone: ${toneNote}`,
    "",
    "Most recent session notes:",
    "---",
    input.sessionContent || "(No session notes provided — generate prep based on campaign context.)",
    "---",
    "",
    "Relevant campaign context (NPCs, locations, lore):",
    "---",
    contextBlock,
    "---",
    "",
    "Generate a complete Lazy DM prep document with ALL of the following sections.",
    "Ground every section in the actual campaign content provided above.",
    "Use the exact section headers shown below.",
    "",
    "## Strong Start",
    "One specific, vivid opening scene or event that launches the session with momentum.",
    "",
    "## Potential Scenes",
    "3-5 scenes or encounters the party might experience this session. Each is one sentence.",
    "",
    "## Secrets and Clues",
    "10 short secrets or clues the party might discover. Each is one sentence. Number them 1-10.",
    "",
    "## Fantastic Locations",
    "2-3 evocative locations. For each: name, then 3 bullet-point sensory details.",
    "",
    "## Important NPCs",
    "3-5 NPCs who might appear. For each: name, one-sentence role, and what they want.",
    "",
    "## Monsters",
    "2-4 monsters or enemy types appropriate for this session. One sentence each.",
    "",
    "## Treasure",
    "2-3 specific rewards, magic items, or valuables the party might find.",
    "",
    "Output rules:",
    "- Use the exact section headers above (## Strong Start, etc.)",
    "- Plain prose and bullet points only. No | characters.",
    "- Reference actual NPC names, location names, and lore from the campaign context.",
    "- Never invent content that contradicts the provided campaign context.",
  ].join("\n");

  const prep = await callAI(provider, prompt, 1500);
  return { prep, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// City / Location Description Generator (#102)
// ---------------------------------------------------------------------------

export type CityDescriptionInput = {
  description: string;
  worldName: string;
  tone: string;
  context: Array<{ type: string; name: string; excerpt: string }>;
};

export type CityDescriptionOutput = {
  content: string;
  provider: string;
};

export async function generateCityDescription(
  provider: ProviderService,
  input: CityDescriptionInput,
): Promise<CityDescriptionOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";

  const contextBlock = input.context.length > 0
    ? input.context.map(c => `[${c.type}] ${c.name}: ${c.excerpt}`).join("\n")
    : "No existing campaign context found.";

  const prompt = [
    `You are a creative game master assistant building a detailed location for a tabletop RPG campaign set in "${input.worldName}".`,
    `Tone: ${toneNote}`,
    "",
    `GM's description: ${input.description}`,
    "",
    "Existing campaign context (do not contradict this):",
    "---",
    contextBlock,
    "---",
    "",
    "Generate a complete location profile using ALL of the following sections.",
    "Use the exact section headers shown below.",
    "",
    "## Overview",
    "2-3 sentences: overall atmosphere, first impressions, and what makes this place distinctive.",
    "",
    "## History",
    "3-4 sentences: founding story, key past events, and how the location came to be what it is today.",
    "",
    "## Districts",
    "3-5 distinct districts or areas. For each: name, one-sentence character, and what the party might do there.",
    "",
    "## Landmarks",
    "3-4 notable landmarks or points of interest. For each: name and 1-2 sentence description.",
    "",
    "## Factions",
    "2-4 major factions or power groups. For each: name, one-sentence agenda, and how they feel about outsiders.",
    "",
    "## Hooks",
    "4-6 rumors or plot hooks that could draw the party into local affairs. Number them 1-6.",
    "",
    "## Sensory Details",
    "3 bullet points: one vivid sight, one sound, one smell that define this place.",
    "",
    "Output rules:",
    "- Use the exact section headers above (## Overview, etc.)",
    "- Plain prose and bullet points only. No | characters.",
    "- Reference existing campaign lore where it fits naturally.",
    "- Never contradict the existing campaign context.",
  ].join("\n");

  const content = await callAI(provider, prompt, 1500);
  return { content, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// NPC Cast Generator (#101)
// ---------------------------------------------------------------------------

export type NpcCastInput = {
  locationDescription: string;
  count: number;
  worldName: string;
  tone: string;
  context: Array<{ type: string; name: string; excerpt: string }>;
};

export type NpcCastOutput = {
  content: string;
  provider: string;
};

export async function generateNpcCast(
  provider: ProviderService,
  input: NpcCastInput,
): Promise<NpcCastOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";

  const contextBlock = input.context.length > 0
    ? input.context.map(c => `[${c.type}] ${c.name}: ${c.excerpt}`).join("\n")
    : "No existing campaign context found.";

  const prompt = [
    `You are a creative game master assistant generating a cast of NPCs for a tabletop RPG campaign set in "${input.worldName}".`,
    `Tone: ${toneNote}`,
    "",
    `Location: ${input.locationDescription}`,
    `Generate exactly ${input.count} NPCs for this location.`,
    "",
    "Existing campaign context (weave in existing actors where relevant; do not contradict this):",
    "---",
    contextBlock,
    "---",
    "",
    `For each of the ${input.count} NPCs, use this exact format:`,
    "",
    "### [NPC Name]",
    "**Role:** occupation and social position in one sentence.",
    "**Appearance:** one sentence physical description.",
    "**Personality:** 2-sentence temperament and manner.",
    "**Mannerism:** one specific verbal tic or physical habit.",
    "**Secret:** one thing they are hiding.",
    "**Hook:** one way the party might get entangled with them.",
    "",
    "Output rules:",
    "- Use the exact format above for every NPC.",
    "- Plain prose only. No | characters.",
    "- Names should fit the campaign tone.",
    "- Secrets and hooks should connect to each other or to existing campaign lore where possible.",
    "- Never contradict the existing campaign context.",
  ].join("\n");

  const content = await callAI(provider, prompt, 2000);
  return { content, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// Roll Table Generator (#113)
// ---------------------------------------------------------------------------

export type RollTableInput = {
  prompt: string;
  count: number;
  worldName: string;
  tone: string;
};

export type RollTableEntry = {
  weight: number;
  text: string;
};

export type RollTableOutput = {
  name: string;
  entries: RollTableEntry[];
  provider: string;
};

export async function generateRollTable(
  provider: ProviderService,
  input: RollTableInput,
): Promise<RollTableOutput> {
  const toneNote = TONE_DESCRIPTION[input.tone as BoxedTextTone] ?? "neutral and vivid";

  const prompt = [
    `You are a creative game master assistant generating a roll table for a tabletop RPG campaign set in "${input.worldName}".`,
    `Tone: ${toneNote}`,
    "",
    `Table theme: ${input.prompt}`,
    `Generate exactly ${input.count} entries for this roll table.`,
    "",
    "First, output a concise table name on its own line, prefixed with 'TABLE NAME: '.",
    "Then output each entry on its own line, numbered 1 to ${count}, in this format:",
    "1. Entry text here",
    "2. Entry text here",
    "...",
    "",
    "Output rules:",
    "- Table name should be short (3-6 words) and descriptive.",
    "- Each entry is one sentence — specific, evocative, and useful at the table.",
    "- Entries should be varied — no two entries should feel the same.",
    "- Plain text only. No markdown, no | characters.",
    `- Output exactly ${input.count} numbered entries.`,
  ].join("\n");

  const raw = await callAI(provider, prompt, Math.max(800, input.count * 60));

  const nameMatch = raw.match(/TABLE NAME:\s*(.+)/i);
  const name = nameMatch?.[1]?.trim() ?? input.prompt.slice(0, 50);

  const entries: RollTableEntry[] = raw
    .split("\n")
    .filter(l => /^\d+\./.test(l.trim()))
    .map(l => l.replace(/^\d+\.\s*/, "").trim())
    .filter(l => l.length > 0)
    .slice(0, input.count)
    .map((text, i) => ({ weight: i + 1, text }));

  if (entries.length === 0) {
    throw new GenerationError("AI returned no valid roll table entries.");
  }

  return { name, entries, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// NPC stat block generation (#110)
// ---------------------------------------------------------------------------

export type NpcStatBlockAction = {
  name: string;
  attackBonus: number | undefined;
  damage: string | undefined;
  damageType: string | undefined;
  range: string | undefined;
  description: string;
};

export type NpcStatBlockFeature = {
  name: string;
  description: string;
};

export type NpcStatBlockResult = {
  name: string;
  size: string;
  creatureType: string;
  subtype: string;
  alignment: string;
  cr: number;
  ac: number;
  acSource: string;
  hpMax: number;
  hpFormula: string;
  speedWalk: number;
  speedFly: number;
  speedSwim: number;
  speedClimb: number;
  speedBurrow: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows: string[];
  skills: string[];
  senses: string;
  languages: string;
  damageImmunities: string;
  damageResistances: string;
  damageVulnerabilities: string;
  conditionImmunities: string;
  biography: string;
  traits: NpcStatBlockFeature[];
  actions: NpcStatBlockAction[];
  bonusActions: NpcStatBlockFeature[];
  reactions: NpcStatBlockFeature[];
  legendaryActions: NpcStatBlockFeature[];
  provider: string;
};

export type NpcStatBlockInput = {
  description: string;
  cr: number | undefined;
  tone: string | undefined;
  worldName: string | undefined;
};

function clampAbility(v: unknown): number {
  const n = typeof v === "number" ? Math.round(v) : 10;
  return Math.max(1, Math.min(30, n));
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function safeFeatureArray(v: unknown): NpcStatBlockFeature[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x))
    .map((x) => ({
      name: safeString(x["name"], "Unknown"),
      description: safeString(x["description"]),
    }))
    .filter((f) => f.name && f.description);
}

function safeActionArray(v: unknown): NpcStatBlockAction[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x))
    .map((x) => ({
      name: safeString(x["name"], "Unknown"),
      description: safeString(x["description"]),
      attackBonus: typeof x["attackBonus"] === "number" ? x["attackBonus"] : undefined,
      damage: typeof x["damage"] === "string" ? x["damage"] : undefined,
      damageType: typeof x["damageType"] === "string" ? x["damageType"] : undefined,
      range: typeof x["range"] === "string" ? x["range"] : undefined,
    }))
    .filter((a) => a.name && a.description);
}

function normalizeCr(v: unknown): number {
  if (typeof v === "number") {
    // Allow fractional CRs: 0 (CR 0), 0.125 (1/8), 0.25 (1/4), 0.5 (1/2), 1-30
    if (v <= 0) return 0;
    if (v < 0.2) return 0.125;
    if (v < 0.4) return 0.25;
    if (v < 0.8) return 0.5;
    return Math.min(30, Math.max(1, Math.round(v)));
  }
  if (typeof v === "string") {
    if (v === "1/8") return 0.125;
    if (v === "1/4") return 0.25;
    if (v === "1/2") return 0.5;
    const n = parseFloat(v);
    if (!isNaN(n)) return normalizeCr(n);
  }
  return 1;
}

export async function generateNpcStatBlock(
  provider: ProviderService,
  input: NpcStatBlockInput,
): Promise<NpcStatBlockResult> {
  const crHint = input.cr != null
    ? `Target CR: ${input.cr}`
    : "Choose an appropriate CR based on the description";

  const prompt = [
    "You are a D&D 5e game master creating an NPC stat block for a tabletop campaign.",
    "Return ONLY a valid JSON object. No markdown, no explanation, no surrounding text.",
    "",
    `World: ${input.worldName ?? "a D&D 5e world"}`,
    `NPC description: ${input.description}`,
    crHint,
    `Tone: ${input.tone ?? "neutral"}`,
    "",
    "Required JSON structure (fill every field; use empty string or 0 for absent values):",
    `{`,
    `  "name": "NPC Name",`,
    `  "size": "Medium",`,
    `  "creatureType": "humanoid",`,
    `  "subtype": "human",`,
    `  "alignment": "chaotic evil",`,
    `  "cr": 3,`,
    `  "ac": 15,`,
    `  "acSource": "chain mail",`,
    `  "hpMax": 52,`,
    `  "hpFormula": "8d8+16",`,
    `  "speedWalk": 30, "speedFly": 0, "speedSwim": 0, "speedClimb": 0, "speedBurrow": 0,`,
    `  "str": 16, "dex": 11, "con": 14, "int": 11, "wis": 11, "cha": 15,`,
    `  "savingThrows": ["str", "con"],`,
    `  "skills": ["athletics", "intimidation"],`,
    `  "senses": "passive Perception 10",`,
    `  "languages": "Common",`,
    `  "damageImmunities": "", "damageResistances": "", "damageVulnerabilities": "",`,
    `  "conditionImmunities": "",`,
    `  "biography": "2-3 GM-facing sentences about personality and background.",`,
    `  "traits": [`,
    `    { "name": "Brave", "description": "Has advantage on saving throws against the frightened condition." }`,
    `  ],`,
    `  "actions": [`,
    `    { "name": "Longsword", "attackBonus": 5, "damage": "1d8+3", "damageType": "slashing", "range": "5 ft.", "description": "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8+3) slashing damage." }`,
    `  ],`,
    `  "bonusActions": [],`,
    `  "reactions": [],`,
    `  "legendaryActions": []`,
    `}`,
    "",
    "Rules:",
    "- cr: use 0.125 for CR 1/8, 0.25 for CR 1/4, 0.5 for CR 1/2, then integers 1-30",
    "- savingThrows: abbreviations only — str, dex, con, int, wis, cha",
    "- skills: lowercase full names — athletics, perception, stealth, deception, etc.",
    "- Generate 1-3 actions and 0-3 traits appropriate for the CR",
    "- Include attackBonus, damage, damageType, and range only on weapon attacks",
    "- biography: 2-3 sentences of GM-facing flavor text",
  ].join("\n");

  const raw = await callAI(provider, prompt, 2000);

  // Strip markdown fences and find the JSON object
  const cleaned = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new GenerationError(`AI did not return a JSON object for the stat block. Response: ${raw.slice(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new GenerationError(`AI returned malformed JSON for the stat block: ${cleaned.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new GenerationError("AI stat block response is not a JSON object.");
  }

  const obj = parsed as Record<string, unknown>;

  return {
    name: safeString(obj["name"], "Generated NPC"),
    size: safeString(obj["size"], "Medium"),
    creatureType: safeString(obj["creatureType"], "humanoid"),
    subtype: safeString(obj["subtype"]),
    alignment: safeString(obj["alignment"], "unaligned"),
    cr: normalizeCr(obj["cr"]),
    ac: typeof obj["ac"] === "number" ? Math.max(1, obj["ac"]) : 10,
    acSource: safeString(obj["acSource"]),
    hpMax: typeof obj["hpMax"] === "number" ? Math.max(1, obj["hpMax"]) : 10,
    hpFormula: safeString(obj["hpFormula"], "2d8"),
    speedWalk: typeof obj["speedWalk"] === "number" ? Math.max(0, obj["speedWalk"]) : 30,
    speedFly: typeof obj["speedFly"] === "number" ? Math.max(0, obj["speedFly"]) : 0,
    speedSwim: typeof obj["speedSwim"] === "number" ? Math.max(0, obj["speedSwim"]) : 0,
    speedClimb: typeof obj["speedClimb"] === "number" ? Math.max(0, obj["speedClimb"]) : 0,
    speedBurrow: typeof obj["speedBurrow"] === "number" ? Math.max(0, obj["speedBurrow"]) : 0,
    str: clampAbility(obj["str"]),
    dex: clampAbility(obj["dex"]),
    con: clampAbility(obj["con"]),
    int: clampAbility(obj["int"]),
    wis: clampAbility(obj["wis"]),
    cha: clampAbility(obj["cha"]),
    savingThrows: safeStringArray(obj["savingThrows"]).filter(s => ["str","dex","con","int","wis","cha"].includes(s)),
    skills: safeStringArray(obj["skills"]),
    senses: safeString(obj["senses"]),
    languages: safeString(obj["languages"]),
    damageImmunities: safeString(obj["damageImmunities"]),
    damageResistances: safeString(obj["damageResistances"]),
    damageVulnerabilities: safeString(obj["damageVulnerabilities"]),
    conditionImmunities: safeString(obj["conditionImmunities"]),
    biography: safeString(obj["biography"]),
    traits: safeFeatureArray(obj["traits"]),
    actions: safeActionArray(obj["actions"]),
    bonusActions: safeFeatureArray(obj["bonusActions"]),
    reactions: safeFeatureArray(obj["reactions"]),
    legendaryActions: safeFeatureArray(obj["legendaryActions"]),
    provider: provider.provider,
  };
}

// ---------------------------------------------------------------------------
// Campaign Consistency Audit (#167)
// ---------------------------------------------------------------------------

export type ConsistencyAuditContentDocument = {
  uuid: string;
  name: string;
  type: string;
  content: string;
};

export type ConsistencyAuditInput = {
  documents: ConsistencyAuditContentDocument[];
  worldName: string;
  focus?: string;
  limit?: number;
};

export type ConsistencyAuditOutput = {
  findings: ConsistencyFinding[];
  model: string;
};

export async function auditConsistency(
  provider: ProviderService,
  input: ConsistencyAuditInput,
): Promise<ConsistencyAuditOutput> {
  const { documents, worldName, focus, limit = 20 } = input;

  const docBlock = documents
    .map((d, i) => `[${i + 1}] ${d.name} (${d.type}, UUID: ${d.uuid})\n${d.content}`)
    .join("\n\n---\n\n");

  const focusNote = focus
    ? `Focus: Pay special attention to documents mentioning "${focus}".`
    : "";

  const prompt = [
    `You are a tabletop RPG campaign editor reviewing documents for the campaign "${worldName}".`,
    "Identify internal inconsistencies: contradictory facts, duplicate entities by different names, and timeline conflicts.",
    focusNote,
    "",
    "Campaign documents:",
    "---",
    docBlock,
    "---",
    "",
    `Find up to ${limit} issues. For each finding, respond with a JSON object with these exact keys:`,
    '- "category": one of "contradiction", "duplicate-entity", "timeline-conflict"',
    '- "severity": one of "high", "medium", "low"',
    '- "confidence": one of "high", "medium", "low"',
    '- "sourceUuids": array of UUID strings from the documents involved (e.g. ["JournalEntry.abc.JournalEntryPage.xyz"])',
    '- "sourceNames": array of document name strings matching the UUIDs',
    '- "explanation": one sentence describing the inconsistency',
    '- "evidence": array of 1-3 short quoted or paraphrased excerpts that demonstrate the conflict',
    '- "suggestion": optional one-sentence suggestion for how to resolve it',
    "",
    `Output ONLY a raw JSON array of up to ${limit} finding objects. No markdown fences, no prose, no explanation — start your response with [ and end with ].`,
    "If you find no inconsistencies, output exactly: []",
  ].filter(Boolean).join("\n");

  const raw = await callAI(provider, prompt, 2000);

  // Strip markdown code fences then extract the outermost JSON array.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // Find the first [ ... ] span that encloses a complete array.
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return { findings: [], model: provider.provider };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    // AI wrapped output in prose — return empty rather than erroring.
    return { findings: [], model: provider.provider };
  }

  if (!Array.isArray(parsed)) {
    return { findings: [], model: provider.provider };
  }

  const findings = (parsed as unknown[]).filter((f): f is ConsistencyFinding => {
    if (typeof f !== "object" || f === null) return false;
    const obj = f as Record<string, unknown>;
    return (
      typeof obj["category"] === "string" &&
      typeof obj["severity"] === "string" &&
      typeof obj["confidence"] === "string" &&
      Array.isArray(obj["sourceUuids"]) &&
      Array.isArray(obj["sourceNames"]) &&
      typeof obj["explanation"] === "string" &&
      Array.isArray(obj["evidence"])
    );
  }).slice(0, limit);

  return { findings, model: provider.provider };
}
