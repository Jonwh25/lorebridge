import { randomUUID } from "node:crypto";
import type { QuestObjective } from "@lorebridge/shared/capabilities";

const WRITE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type PendingQuestObjectivesWrite = {
  token: string;
  journalId: string;
  journalName: string;
  currentObjectives: QuestObjective[];
  proposedObjectives: QuestObjective[];
  rationale: string;
  sourceId: string | undefined;
  expiresAt: Date;
  usedAt?: Date;
};

export class QuestObjectivesWriteRegistry {
  private readonly pending = new Map<string, PendingQuestObjectivesWrite>();

  register(params: Omit<PendingQuestObjectivesWrite, "token" | "expiresAt">): PendingQuestObjectivesWrite {
    this.evictExpired();
    const token = randomUUID();
    const entry: PendingQuestObjectivesWrite = {
      ...params,
      token,
      expiresAt: new Date(Date.now() + WRITE_TTL_MS),
    };
    this.pending.set(token, entry);
    return entry;
  }

  reject(token: string): PendingQuestObjectivesWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  consume(token: string): PendingQuestObjectivesWrite {
    const entry = this.#validate(token);
    entry.usedAt = new Date();
    return entry;
  }

  #validate(token: string): PendingQuestObjectivesWrite {
    const entry = this.pending.get(token);
    if (!entry) throw new QuestObjectivesTokenError("not_found", "Quest objectives write token not found.");
    if (entry.usedAt) throw new QuestObjectivesTokenError("already_used", "This write token has already been used.");
    if (entry.expiresAt < new Date()) {
      this.pending.delete(token);
      throw new QuestObjectivesTokenError("expired", "This write token has expired.");
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

export class QuestObjectivesTokenError extends Error {
  constructor(
    public readonly reason: "not_found" | "already_used" | "expired",
    message: string,
  ) {
    super(message);
    this.name = "QuestObjectivesTokenError";
  }
}
