import path from "node:path";

export interface GitHubAdapterConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  campaignRoot: string;
}

export interface BackendConfig {
  host: string;
  port: number;
  pairingEnabled: boolean;
  pairingTtlSeconds: number;
  dataDir: string;
  foundryDataDir?: string;
  github?: GitHubAdapterConfig;
  elevenLabsApiKey?: string;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 3210;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("LOREBRIDGE_PORT must be an integer between 1 and 65535");
  }
  return parsed;
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function loadGitHubConfig(env: NodeJS.ProcessEnv): GitHubAdapterConfig | undefined {
  const token = env.GITHUB_TOKEN?.trim();
  const owner = env.GITHUB_OWNER?.trim();
  const repo = env.GITHUB_REPO?.trim();
  if (!token || !owner || !repo) return undefined;
  return {
    token,
    owner,
    repo,
    branch: env.GITHUB_BRANCH?.trim() || "main",
    campaignRoot: env.GITHUB_CAMPAIGN_ROOT?.trim() || "campaign",
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const github = loadGitHubConfig(env);
  return {
    host: env.LOREBRIDGE_HOST?.trim() || "127.0.0.1",
    port: parsePort(env.LOREBRIDGE_PORT),
    pairingEnabled: env.LOREBRIDGE_PAIRING_ENABLED === "true",
    pairingTtlSeconds: parsePositiveInteger("LOREBRIDGE_PAIRING_TTL_SECONDS", env.LOREBRIDGE_PAIRING_TTL_SECONDS, 300),
    dataDir: path.resolve(env.LOREBRIDGE_DATA_DIR?.trim() || ".lorebridge"),
    ...(env.LOREBRIDGE_FOUNDRY_DATA_DIR?.trim() ? { foundryDataDir: path.resolve(env.LOREBRIDGE_FOUNDRY_DATA_DIR.trim()) } : {}),
    ...(github ? { github } : {}),
    ...(env.ELEVENLABS_API_KEY?.trim() ? { elevenLabsApiKey: env.ELEVENLABS_API_KEY.trim() } : {}),
  };
}
