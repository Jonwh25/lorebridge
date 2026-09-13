import { randomUUID } from "node:crypto";

const WRITE_TTL_MS = 5 * 60 * 1000;

export type PendingFactionProfileWrite = {
  token: string;
  journalId: string;
  journalName: string;
  pageId?: string;
  proposedPageContent?: string;
  proposedFactionProfile: Record<string, unknown>;
  rationale: string;
  sourceId: string | undefined;
  expiresAt: Date;
  usedAt?: Date;
};

export class FactionProfileWriteRegistry {
  private readonly pending = new Map<string, PendingFactionProfileWrite>();

  register(params: Omit<PendingFactionProfileWrite, "token" | "expiresAt">): PendingFactionProfileWrite {
    this.evictExpired();
    const token = randomUUID();
    const entry: PendingFactionProfileWrite = {
      ...params,
      token,
      expiresAt: new Date(Date.now() + WRITE_TTL_MS),
    };
    this.pending.set(token, entry);
    return entry;
  }

  reject(token: string): PendingFactionProfileWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  consume(token: string): PendingFactionProfileWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  #validate(token: string): PendingFactionProfileWrite {
    const entry = this.pending.get(token);
    if (!entry) throw new FactionProfileTokenError("not_found", "Faction profile write token not found.");
    if (entry.usedAt) throw new FactionProfileTokenError("already_used", "This write token has already been used.");
    if (entry.expiresAt < new Date()) {
      this.pending.delete(token);
      throw new FactionProfileTokenError("expired", "This write token has expired.");
    }
    return entry;
  }

  private evictExpired(): void {
    const now = new Date();
    for (const [token, entry] of this.pending) {
      if (entry.expiresAt < now) this.pending.delete(token);
    }
  }
}

export class FactionProfileTokenError extends Error {
  constructor(
    public readonly reason: "not_found" | "already_used" | "expired",
    message: string,
  ) {
    super(message);
    this.name = "FactionProfileTokenError";
  }
}
