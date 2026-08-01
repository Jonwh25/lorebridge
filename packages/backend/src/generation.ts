import type {
  BoxedTextLength,
  BoxedTextTone,
  GenerateBoxedTextInput,
  GenerateBoxedTextOutput,
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
  if (!provider.enabled || !provider.apiKey) {
    throw new GenerationError("No AI provider is configured on the backend.");
  }
  if (provider.provider === "anthropic") {
    return callAnthropic(provider.apiKey, prompt, maxTokens);
  }
  if (provider.provider === "openai") {
    return callOpenAI(provider.apiKey, prompt, maxTokens);
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

async function callOpenAI(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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
    "",
    "Respond in this exact format:",
    "PERSONALITY: <text>",
    "MANNERISM: <text>",
    "SECRET: <text>",
  ].join("\n");

  const raw = await callAI(provider, prompt, 512);

  const personality = raw.match(/PERSONALITY:\s*(.+?)(?=\nMANNERISM:|\n\n|$)/s)?.[1]?.trim() ?? "";
  const mannerism = raw.match(/MANNERISM:\s*(.+?)(?=\nSECRET:|\n\n|$)/s)?.[1]?.trim() ?? "";
  const secret = raw.match(/SECRET:\s*(.+?)$/s)?.[1]?.trim() ?? "";

  if (!personality || !mannerism || !secret) {
    throw new GenerationError("AI returned an unexpected format for the NPC profile.");
  }

  return { personality, mannerism, secret, provider: provider.provider };
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
