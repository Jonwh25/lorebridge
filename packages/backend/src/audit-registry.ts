import { randomUUID } from "node:crypto";

const ROLLBACK_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type AuditEntry = {
  auditToken: string;
  journalId: string;
  pageId: string;
  pageName: string;
  journalName: string;
  sourceId: string | undefined;
  previousContent: string;
  newContent: string;
  approvedAt: Date;
  expiresAt: Date;
  rolledBackAt?: Date;
};

export class AuditRegistry {
  private readonly entries = new Map<string, AuditEntry>();

  record(params: Omit<AuditEntry, "auditToken" | "approvedAt" | "expiresAt">): AuditEntry {
    this.evictExpired();
    const auditToken = randomUUID();
    const now = new Date();
    const entry: AuditEntry = {
      ...params,
      auditToken,
      approvedAt: now,
      expiresAt: new Date(now.getTime() + ROLLBACK_TTL_MS),
    };
    this.entries.set(auditToken, entry);
    return entry;
  }

  /**
   * Validates and consumes an audit token for rollback. Marks it as rolled back
   * so the same write cannot be rolled back twice.
   */
  consume(auditToken: string): AuditEntry {
    const entry = this.entries.get(auditToken);
    if (!entry) throw new AuditTokenError("not_found", "Audit token not found.");
    if (entry.rolledBackAt) throw new AuditTokenError("already_used", "This write has already been rolled back.");
    if (entry.expiresAt < new Date()) {
      this.entries.delete(auditToken);
      throw new AuditTokenError("expired", "The rollback window for this write has expired.");
    }
    entry.rolledBackAt = new Date();
    return entry;
  }

  private evictExpired(): void {
    const now = new Date();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt < now) this.entries.delete(token);
    }
  }
}

export class AuditTokenError extends Error {
  constructor(
    public readonly reason: "not_found" | "already_used" | "expired",
    message: string,
  ) {
    super(message);
    this.name = "AuditTokenError";
  }
}
