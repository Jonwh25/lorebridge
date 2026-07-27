import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BackendIdentity {
  id: string;
  secret: string;
  createdAt: string;
  fingerprint: string;
}

function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").match(/.{1,4}/g)?.slice(0, 8).join(":") ?? "";
}

export async function loadOrCreateIdentity(dataDir: string): Promise<BackendIdentity> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const identityPath = path.join(dataDir, "identity.json");

  try {
    const parsed = JSON.parse(await readFile(identityPath, "utf8")) as Partial<BackendIdentity>;
    if (typeof parsed.id !== "string" || typeof parsed.secret !== "string" || typeof parsed.createdAt !== "string") {
      throw new Error("LoreBridge identity file is invalid");
    }
    return {
      id: parsed.id,
      secret: parsed.secret,
      createdAt: parsed.createdAt,
      fingerprint: fingerprint(parsed.secret),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const secret = randomBytes(32).toString("base64url");
  const identity: BackendIdentity = {
    id: `lb_${randomBytes(12).toString("base64url")}`,
    secret,
    createdAt: new Date().toISOString(),
    fingerprint: fingerprint(secret),
  };

  await writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return identity;
}
