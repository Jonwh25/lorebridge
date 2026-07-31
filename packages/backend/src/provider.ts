export type ProviderName = "anthropic" | "openai" | "none";

export interface ProviderStatus {
  provider: ProviderName;
  enabled: boolean;
  healthy: boolean | null;
}

interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
}

function readConfig(env: NodeJS.ProcessEnv): ProviderConfig | null {
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey };
  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) return { provider: "openai", apiKey: openaiKey };
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

async function validateOpenAI(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return response.status === 200 || response.status === 429;
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
    return this.config?.apiKey;
  }

  async validate(): Promise<boolean> {
    if (!this.config) return false;
    if (this.cachedHealth !== null) return this.cachedHealth;
    if (this.validating) return false;
    this.validating = true;
    try {
      const healthy = this.config.provider === "anthropic"
        ? await validateAnthropic(this.config.apiKey)
        : await validateOpenAI(this.config.apiKey);
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
