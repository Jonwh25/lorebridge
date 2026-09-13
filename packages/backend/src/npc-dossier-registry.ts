import { randomUUID } from "node:crypto";

const WRITE_TTL_MS = 5 * 60 * 1000;

export type NpcDossierTab = "roleplay" | "overview" | "knowledge";

export type PendingNpcDossierWrite = {
  token: string;
  journalId: string;
  journalName: string;
  tab: NpcDossierTab;
  proposedFields: Record<string, unknown>;
  rationale: string;
  sourceId: string | undefined;
  expiresAt: Date;
  usedAt?: Date;
};

export class NpcDossierWriteRegistry {
  private readonly pending = new Map<string, PendingNpcDossierWrite>();

  register(params: Omit<PendingNpcDossierWrite, "token" | "expiresAt">): PendingNpcDossierWrite {
    this.evictExpired();
    const token = randomUUID();
    const entry: PendingNpcDossierWrite = {
      ...params,
      token,
      expiresAt: new Date(Date.now() + WRITE_TTL_MS),
    };
    this.pending.set(token, entry);
    return entry;
  }

  reject(token: string): PendingNpcDossierWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  consume(token: string): PendingNpcDossierWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  #validate(token: string): PendingNpcDossierWrite {
    const entry = this.pending.get(token);
    if (!entry) throw new NpcDossierTokenError("not_found", "NPC dossier write token not found.");
    if (entry.usedAt) throw new NpcDossierTokenError("already_used", "This write token has already been used.");
    if (entry.expiresAt < new Date()) {
      this.pending.delete(token);
      throw new NpcDossierTokenError("expired", "This write token has expired.");
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

export class NpcDossierTokenError extends Error {
  constructor(
    public readonly reason: "not_found" | "already_used" | "expired",
    message: string,
  ) {
    super(message);
    this.name = "NpcDossierTokenError";
  }
}
