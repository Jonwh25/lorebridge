import path from "node:path";

export interface BackendConfig {
  host: string;
  port: number;
  pairingEnabled: boolean;
  pairingTtlSeconds: number;
  dataDir: string;
  foundryDataDir?: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  return {
    host: env.LOREBRIDGE_HOST?.trim() || "127.0.0.1",
    port: parsePort(env.LOREBRIDGE_PORT),
    pairingEnabled: env.LOREBRIDGE_PAIRING_ENABLED === "true",
    pairingTtlSeconds: parsePositiveInteger("LOREBRIDGE_PAIRING_TTL_SECONDS", env.LOREBRIDGE_PAIRING_TTL_SECONDS, 300),
    dataDir: path.resolve(env.LOREBRIDGE_DATA_DIR?.trim() || ".lorebridge"),
    foundryDataDir: env.LOREBRIDGE_FOUNDRY_DATA_DIR?.trim() ? path.resolve(env.LOREBRIDGE_FOUNDRY_DATA_DIR.trim()) : undefined,
  };
}
