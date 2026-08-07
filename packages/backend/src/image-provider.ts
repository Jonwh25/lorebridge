export type ImageProviderName = "stability" | "openai" | "none";

export interface ImageProviderStatus {
  provider: ImageProviderName;
  enabled: boolean;
  model: string | undefined;
}

export interface ImageGenerationResult {
  base64: string;
  mimeType: string;
}

interface StabilityConfig {
  provider: "stability";
  apiKey: string;
  model: string;
}

interface OpenAIImageConfig {
  provider: "openai";
  apiKey: string;
  baseUrl: string | undefined;
  model: string;
}

type ImageConfig = StabilityConfig | OpenAIImageConfig;

function readImageConfig(env: NodeJS.ProcessEnv): ImageConfig | null {
  const explicit = env.IMAGE_PROVIDER?.trim().toLowerCase();

  // Explicit Stability AI configuration
  if (explicit === "stability" || (!explicit && env.STABILITY_API_KEY?.trim())) {
    const key = env.STABILITY_API_KEY?.trim();
    if (!key) return null;
    return {
      provider: "stability",
      apiKey: key,
      model: env.STABILITY_MODEL?.trim() || "stable-image-core",
    };
  }

  // Explicit OpenAI image config, or fall back to OpenAI text provider for image generation
  if (explicit === "openai" || (!explicit && env.OPENAI_API_KEY?.trim())) {
    const key = env.OPENAI_API_KEY?.trim();
    if (!key) return null;
    return {
      provider: "openai",
      apiKey: key,
      baseUrl: env.OPENAI_BASE_URL?.trim() || undefined,
      model: env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-3",
    };
  }

  return null;
}

async function generateViaStability(config: StabilityConfig, prompt: string): Promise<ImageGenerationResult> {
  // Stability AI Stable Image core/ultra endpoint — returns JSON when Accept: application/json
  const endpoint = config.model === "stable-image-ultra"
    ? "https://api.stability.ai/v2beta/stable-image/generate/ultra"
    : "https://api.stability.ai/v2beta/stable-image/generate/core";

  const form = new FormData();
  form.append("prompt", prompt);
  form.append("output_format", "png");
  form.append("aspect_ratio", "1:1");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Accept": "application/json",
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => `status ${response.status}`);
    throw new ImageProviderError(`Stability AI error: ${text}`);
  }

  const json = await response.json() as { image?: string; errors?: string[] };
  if (!json.image) {
    throw new ImageProviderError(`Stability AI returned no image. Errors: ${(json.errors ?? []).join(", ")}`);
  }
  return { base64: json.image, mimeType: "image/png" };
}

async function generateViaOpenAI(config: OpenAIImageConfig, prompt: string): Promise<ImageGenerationResult> {
  const base = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new ImageProviderError(`OpenAI image error: ${err?.error?.message ?? `status ${response.status}`}`);
  }

  const json = await response.json() as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new ImageProviderError("OpenAI returned no image data.");
  return { base64: b64, mimeType: "image/png" };
}

export class ImageProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProviderError";
  }
}

export class ImageProviderService {
  private readonly config: ImageConfig | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.config = readImageConfig(env);
  }

  get provider(): ImageProviderName {
    return this.config?.provider ?? "none";
  }

  get enabled(): boolean {
    return this.config !== null;
  }

  get model(): string | undefined {
    return this.config ? ("model" in this.config ? this.config.model : undefined) : undefined;
  }

  status(): ImageProviderStatus {
    return { provider: this.provider, enabled: this.enabled, model: this.model };
  }

  async generateImage(prompt: string): Promise<ImageGenerationResult> {
    if (!this.config) throw new ImageProviderError("No image provider is configured.");
    if (this.config.provider === "stability") return generateViaStability(this.config, prompt);
    return generateViaOpenAI(this.config, prompt);
  }
}
