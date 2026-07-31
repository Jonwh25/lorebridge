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
    "Generate read-aloud boxed text for a tabletop RPG scene.",
    "",
    `Source document: ${input.documentName} (from ${input.sourceName})`,
    `Tone: ${TONE_DESCRIPTION[tone]}`,
    `Length: ${LENGTH_WORDS[length]}`,
    `Audience: ${audienceNote}`,
    "",
    "Source content:",
    "---",
    input.content,
    "---",
    "",
    "Write only the boxed text itself. Do not include a title, preamble, or explanation.",
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
