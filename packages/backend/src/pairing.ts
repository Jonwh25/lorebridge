import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { BackendIdentity } from "./identity.js";

interface PairingAttempt {
  code: string;
  expiresAt: number;
}

interface TokenPayload {
  backendId: string;
  clientId: string;
  clientName: string;
  issuedAt: number;
}

export class PairingService {
  private attempt: PairingAttempt | undefined;

  constructor(
    private readonly identity: BackendIdentity,
    private readonly ttlSeconds: number,
  ) {}

  start(now = Date.now()): { code: string; expiresAt: string } {
    const code = `${randomInt(0, 1_000_000)}`.padStart(6, "0");
    const expiresAt = now + this.ttlSeconds * 1000;
    this.attempt = { code, expiresAt };
    return { code: `${code.slice(0, 3)}-${code.slice(3)}`, expiresAt: new Date(expiresAt).toISOString() };
  }

  complete(code: string, clientName: string, now = Date.now()): { token: string; clientId: string } | undefined {
    const normalized = code.replace(/\D/g, "");
    if (!this.attempt || this.attempt.expiresAt < now || normalized !== this.attempt.code) return undefined;
    this.attempt = undefined;

    const clientId = `client_${crypto.randomUUID()}`;
    const payload: TokenPayload = { backendId: this.identity.id, clientId, clientName, issuedAt: now };
    return { token: this.sign(payload), clientId };
  }

  verify(token: string): TokenPayload | undefined {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return undefined;
    const expected = this.signature(encodedPayload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return undefined;

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
      return payload.backendId === this.identity.id ? payload : undefined;
    } catch {
      return undefined;
    }
  }

  private sign(payload: TokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encodedPayload}.${this.signature(encodedPayload)}`;
  }

  private signature(encodedPayload: string): string {
    return createHmac("sha256", this.identity.secret).update(encodedPayload).digest("base64url");
  }
}
