export type ImageProviderName = "stability" | "flux" | "openai" | "ideogram" | "workersai" | "none";

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

interface FluxConfig {
  provider: "flux";
  apiKey: string;
  model: string;
}

interface OpenAIImageConfig {
  provider: "openai";
  apiKey: string;
  baseUrl: string | undefined;
  model: string;
}

interface IdeogramConfig {
  provider: "ideogram";
  apiKey: string;
  model: string;
}

interface WorkersAIConfig {
  provider: "workersai";
  accountId: string;
  apiToken: string;
  model: string;
}

type ImageConfig = StabilityConfig | FluxConfig | OpenAIImageConfig | IdeogramConfig | WorkersAIConfig;

export class ImageProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProviderError";
  }
}

// ---------------------------------------------------------------------------
// Config reader — explicit IMAGE_PROVIDER wins; otherwise auto-detect from keys
// ---------------------------------------------------------------------------

function readImageConfig(env: NodeJS.ProcessEnv): ImageConfig | null {
  const explicit = env.IMAGE_PROVIDER?.trim().toLowerCase();

  if (explicit === "stability" || (!explicit && env.STABILITY_API_KEY?.trim())) {
    const key = env.STABILITY_API_KEY?.trim();
    if (!key) return null;
    return { provider: "stability", apiKey: key, model: env.STABILITY_MODEL?.trim() || "stable-image-core" };
  }

  if (explicit === "flux" || (!explicit && env.FLUX_API_KEY?.trim())) {
    const key = env.FLUX_API_KEY?.trim();
    if (!key) return null;
    return { provider: "flux", apiKey: key, model: env.FLUX_MODEL?.trim() || "flux-pro-1.1" };
  }

  if (explicit === "ideogram" || (!explicit && env.IDEOGRAM_API_KEY?.trim())) {
    const key = env.IDEOGRAM_API_KEY?.trim();
    if (!key) return null;
    return { provider: "ideogram", apiKey: key, model: env.IDEOGRAM_MODEL?.trim() || "V_3" };
  }

  if (explicit === "workersai" || (!explicit && env.CLOUDFLARE_ACCOUNT_ID?.trim() && env.CLOUDFLARE_API_TOKEN?.trim())) {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
    if (!accountId || !apiToken) return null;
    return {
      provider: "workersai",
      accountId,
      apiToken,
      model: env.CLOUDFLARE_IMAGE_MODEL?.trim() || "@cf/black-forest-labs/flux-1-schnell",
    };
  }

  // OpenAI last — it also supplies the text provider key, so only activate for
  // images when explicitly requested or when no other image key is present
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

// ---------------------------------------------------------------------------
// Stability AI  (Stable Image Core / Ultra)
// ---------------------------------------------------------------------------

async function generateViaStability(config: StabilityConfig, prompt: string, negativePrompt?: string): Promise<ImageGenerationResult> {
  const endpoint = config.model === "stable-image-ultra"
    ? "https://api.stability.ai/v2beta/stable-image/generate/ultra"
    : "https://api.stability.ai/v2beta/stable-image/generate/core";

  const form = new FormData();
  form.append("prompt", prompt);
  if (negativePrompt) form.append("negative_prompt", negativePrompt);
  form.append("seed", String(Math.floor(Math.random() * 4294967295)));
  form.append("output_format", "png");
  form.append("aspect_ratio", "1:1");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.apiKey}`, "Accept": "application/json" },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => `status ${response.status}`);
    throw new ImageProviderError(`Stability AI error: ${text}`);
  }

  const json = await response.json() as { image?: string; errors?: string[] };
  if (!json.image) throw new ImageProviderError(`Stability AI returned no image. Errors: ${(json.errors ?? []).join(", ")}`);
  return { base64: json.image, mimeType: "image/png" };
}

// ---------------------------------------------------------------------------
// FLUX (Black Forest Labs) — async submit → poll → fetch
// ---------------------------------------------------------------------------

const FLUX_POLL_INTERVAL_MS = 2000;
const FLUX_POLL_TIMEOUT_MS = 120_000;

async function generateViaFlux(config: FluxConfig, prompt: string): Promise<ImageGenerationResult> {
  const base = "https://api.bfl.ml/v1";

  // Submit generation request
  const submitResponse = await fetch(`${base}/${config.model}`, {
    method: "POST",
    headers: { "x-key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, width: 1024, height: 1024, seed: Math.floor(Math.random() * 4294967295) }),
  });

  if (!submitResponse.ok) {
    const err = await submitResponse.json().catch(() => ({})) as { message?: string };
    throw new ImageProviderError(`FLUX submit error: ${err?.message ?? `status ${submitResponse.status}`}`);
  }

  const submit = await submitResponse.json() as { id?: string };
  if (!submit.id) throw new ImageProviderError("FLUX returned no task ID.");

  // Poll until ready or timeout
  const deadline = Date.now() + FLUX_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, FLUX_POLL_INTERVAL_MS));

    const pollResponse = await fetch(`${base}/get_result?id=${encodeURIComponent(submit.id)}`, {
      headers: { "x-key": config.apiKey },
    });

    if (!pollResponse.ok) {
      throw new ImageProviderError(`FLUX poll error: status ${pollResponse.status}`);
    }

    const poll = await pollResponse.json() as { status?: string; result?: { sample?: string } };

    if (poll.status === "Ready" && poll.result?.sample) {
      // Fetch the image URL and convert to base64
      const imgResponse = await fetch(poll.result.sample);
      if (!imgResponse.ok) throw new ImageProviderError(`FLUX image fetch error: status ${imgResponse.status}`);
      const buffer = await imgResponse.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = imgResponse.headers.get("content-type") ?? "image/jpeg";
      return { base64, mimeType };
    }

    if (poll.status === "Error" || poll.status === "Failed") {
      throw new ImageProviderError(`FLUX generation failed with status: ${poll.status}`);
    }
    // Still pending — keep polling
  }

  throw new ImageProviderError("FLUX generation timed out after 120 seconds.");
}

// ---------------------------------------------------------------------------
// OpenAI DALL-E
// ---------------------------------------------------------------------------

async function generateViaOpenAI(config: OpenAIImageConfig, prompt: string): Promise<ImageGenerationResult> {
  const base = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, prompt, n: 1, size: "1024x1024" }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new ImageProviderError(`OpenAI image error: ${err?.error?.message ?? `status ${response.status}`}`);
  }

  const json = await response.json() as { data?: { b64_json?: string; url?: string }[] };
  const item = json.data?.[0];

  if (item?.b64_json) return { base64: item.b64_json, mimeType: "image/png" };

  if (item?.url) {
    const imgResponse = await fetch(item.url);
    if (!imgResponse.ok) throw new ImageProviderError(`OpenAI image fetch error: status ${imgResponse.status}`);
    const buffer = await imgResponse.arrayBuffer();
    return { base64: Buffer.from(buffer).toString("base64"), mimeType: imgResponse.headers.get("content-type") ?? "image/png" };
  }

  throw new ImageProviderError("OpenAI returned no image data.");
}

// ---------------------------------------------------------------------------
// Ideogram — returns a URL, fetch and convert to base64
// ---------------------------------------------------------------------------

async function generateViaIdeogram(config: IdeogramConfig, prompt: string): Promise<ImageGenerationResult> {
  const response = await fetch("https://api.ideogram.ai/generate", {
    method: "POST",
    headers: { "Api-Key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_request: {
        prompt,
        model: config.model,
        aspect_ratio: "ASPECT_1_1",
        magic_prompt_option: "AUTO",
        seed: Math.floor(Math.random() * 2147483647),
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { detail?: string; message?: string };
    throw new ImageProviderError(`Ideogram error: ${err?.detail ?? err?.message ?? `status ${response.status}`}`);
  }

  const json = await response.json() as { data?: { url?: string }[] };
  const url = json.data?.[0]?.url;
  if (!url) throw new ImageProviderError("Ideogram returned no image URL.");

  const imgResponse = await fetch(url);
  if (!imgResponse.ok) throw new ImageProviderError(`Ideogram image fetch error: status ${imgResponse.status}`);
  const buffer = await imgResponse.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = imgResponse.headers.get("content-type") ?? "image/jpeg";
  return { base64, mimeType };
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI
// ---------------------------------------------------------------------------

async function generateViaWorkersAI(config: WorkersAIConfig, prompt: string, negativePrompt?: string): Promise<ImageGenerationResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`;

  const body: Record<string, unknown> = {
    prompt,
    seed: Math.floor(Math.random() * 4294967295),
  };
  if (negativePrompt) body["negative_prompt"] = negativePrompt;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { errors?: { message?: string }[]; error?: string };
    const msg = err?.errors?.[0]?.message ?? err?.error ?? `status ${response.status}`;
    throw new ImageProviderError(`Cloudflare Workers AI error: ${msg}`);
  }

  // Workers AI returns raw binary image data
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = response.headers.get("content-type") ?? "image/png";
  return { base64, mimeType };
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

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

  async generateImage(prompt: string, negativePrompt?: string): Promise<ImageGenerationResult> {
    if (!this.config) throw new ImageProviderError("No image provider is configured.");
    switch (this.config.provider) {
      case "stability": return generateViaStability(this.config, prompt, negativePrompt);
      case "flux":      return generateViaFlux(this.config, prompt);
      case "openai":    return generateViaOpenAI(this.config, prompt);
      case "ideogram":  return generateViaIdeogram(this.config, prompt);
      case "workersai": return generateViaWorkersAI(this.config, prompt, negativePrompt);
    }
  }
}
