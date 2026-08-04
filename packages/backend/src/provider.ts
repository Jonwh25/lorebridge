export type ProviderName = "anthropic" | "openai" | "ollama" | "none";

export interface ProviderStatus {
  provider: ProviderName;
  enabled: boolean;
  healthy: boolean | null;
}

interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

function readConfig(env: NodeJS.ProcessEnv): ProviderConfig | null {
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey };

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const baseUrl = env.OPENAI_BASE_URL?.trim() || undefined;
    const model = env.OPENAI_MODEL?.trim() || undefined;
    return {
      provider: "openai",
      apiKey: openaiKey,
      ...(baseUrl !== undefined && { baseUrl }),
      ...(model !== undefined && { model }),
    };
  }

  const ollamaUrl = env.OLLAMA_BASE_URL?.trim();
  if (ollamaUrl) {
    const model = env.OLLAMA_MODEL?.trim() || "llama3.2";
    return { provider: "ollama", apiKey: "", baseUrl: ollamaUrl, model };
  }

  return null;
}

async function validateAnthropic(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    return response.status === 200 || response.status === 429;
  } catch {
    return false;
  }
}

async function validateOpenAI(apiKey: string, baseUrl?: string): Promise<boolean> {
  // baseUrl (when set) is the full API base including /v1, e.g. http://localhost:1234/v1.
  // Append /models to match the pattern used by callOpenAI for /chat/completions.
  const modelsUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/models` : "https://api.openai.com/v1/models";
  try {
    const response = await fetch(modelsUrl, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return response.status === 200 || response.status === 429;
  } catch {
    return false;
  }
}

async function validateOllama(baseUrl: string): Promise<boolean> {
  const modelsUrl = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  try {
    const response = await fetch(modelsUrl);
    return response.status === 200;
  } catch {
    return false;
  }
}

export class ProviderService {
  private readonly config: ProviderConfig | null;
  private cachedHealth: boolean | null = null;
  private validating = false;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.config = readConfig(env);
  }

  get provider(): ProviderName {
    return this.config?.provider ?? "none";
  }

  get enabled(): boolean {
    return this.config !== null;
  }

  get apiKey(): string | undefined {
    return this.config?.apiKey || undefined;
  }

  get baseUrl(): string | undefined {
    return this.config?.baseUrl;
  }

  get model(): string | undefined {
    return this.config?.model;
  }

  async validate(): Promise<boolean> {
    if (!this.config) return false;
    if (this.cachedHealth !== null) return this.cachedHealth;
    if (this.validating) return false;
    this.validating = true;
    try {
      let healthy: boolean;
      if (this.config.provider === "anthropic") {
        healthy = await validateAnthropic(this.config.apiKey);
      } else if (this.config.provider === "ollama") {
        healthy = await validateOllama(this.config.baseUrl ?? "http://localhost:11434");
      } else {
        healthy = await validateOpenAI(this.config.apiKey, this.config.baseUrl);
      }
      this.cachedHealth = healthy;
      return healthy;
    } finally {
      this.validating = false;
    }
  }

  invalidateCache(): void {
    this.cachedHealth = null;
  }

  status(healthy: boolean | null): ProviderStatus {
    return { provider: this.provider, enabled: this.enabled, healthy };
  }
}
