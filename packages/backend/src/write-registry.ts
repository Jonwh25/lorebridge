import { randomUUID } from "node:crypto";

const WRITE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type PendingWrite = {
  token: string;
  journalId: string;
  pageId: string;
  pageName: string;
  journalName: string;
  currentContent: string;
  proposedContent: string;
  rationale: string;
  sourceId: string | undefined;
  expiresAt: Date;
  usedAt?: Date;
};

export class WriteRegistry {
  private readonly pending = new Map<string, PendingWrite>();

  register(params: Omit<PendingWrite, "token" | "expiresAt">): PendingWrite {
    this.evictExpired();
    const token = randomUUID();
    const entry: PendingWrite = {
      ...params,
      token,
      expiresAt: new Date(Date.now() + WRITE_TTL_MS),
    };
    this.pending.set(token, entry);
    return entry;
  }

  /**
   * Explicitly rejects a token without executing a write.
   * Marks the token as used so it cannot be approved later.
   */
  reject(token: string): PendingWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  /**
   * Validates and consumes a token. Returns the entry on success, throws on failure.
   * A consumed or expired token cannot be reused.
   */
  consume(token: string): PendingWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  #validate(token: string): PendingWrite {
    const entry = this.pending.get(token);
    if (!entry) throw new WriteTokenError("not_found", "Write token not found.");
    if (entry.usedAt) throw new WriteTokenError("already_used", "This write token has already been used.");
    if (entry.expiresAt < new Date()) {
      this.pending.delete(token);
      throw new WriteTokenError("expired", "This write token has expired.");
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

export class WriteTokenError extends Error {
  constructor(
    public readonly reason: "not_found" | "already_used" | "expired",
    message: string,
  ) {
    super(message);
    this.name = "WriteTokenError";
  }
}
