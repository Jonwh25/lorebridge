import type {
  BoxedTextLength,
  BoxedTextTone,
  GenerateBoxedTextInput,
  GenerateBoxedTextOutput,
} from "@lorebridge/shared/capabilities";
import type { ProviderService } from "./provider.js";

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

function buildPrompt(input: GenerateBoxedTextInput): string {
  const tone = input.tone ?? "neutral";
  const length = input.length ?? "medium";
  const audience = input.audience ?? "players";
  const audienceNote = audience === "gm"
    ? "This is for the GM's eyes only — not read aloud to players."
    : "This will be read aloud to players at the table.";

  return [
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
}

export async function generateBoxedText(
  provider: ProviderService,
  input: GenerateBoxedTextInput,
): Promise<GenerateBoxedTextOutput> {
  if (!provider.enabled || !provider.apiKey) {
    throw new GenerationError("No AI provider is configured on the backend.");
  }

  const tone = input.tone ?? "neutral";
  const length = input.length ?? "medium";
  const prompt = buildPrompt(input);

  let preview: string;
  if (provider.provider === "anthropic") {
    preview = await callAnthropic(provider.apiKey, prompt);
  } else if (provider.provider === "openai") {
    preview = await callOpenAI(provider.apiKey, prompt);
  } else {
    throw new GenerationError(`Unsupported provider: ${provider.provider}`);
  }

  return {
    preview,
    sources: [{ name: input.documentName }],
    provider: provider.provider,
    tone,
    length,
  };
}

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
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

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 512,
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
