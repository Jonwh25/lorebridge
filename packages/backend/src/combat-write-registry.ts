import { randomUUID } from "node:crypto";
import { COMBAT_WRITE_TTL_MS, type CombatWriteProposal } from "@lorebridge/shared/capabilities";

export type PendingCombatWrite = {
  token: string;
  sourceId: string | undefined;
  approvalProof: string;
  proposal: CombatWriteProposal;
  expiresAt: Date;
  usedAt?: Date;
};

export class CombatWriteRegistry {
  readonly #pending = new Map<string, PendingCombatWrite>();
  constructor(private readonly now: () => number = Date.now) {}

  register(proposal: CombatWriteProposal, approvalProof: string, sourceId?: string, ttlMs = COMBAT_WRITE_TTL_MS): PendingCombatWrite {
    this.#evictExpired();
    const token = randomUUID();
    const entry: PendingCombatWrite = {
      token, sourceId, approvalProof, proposal,
      expiresAt: new Date(this.now() + Math.max(1, Math.min(ttlMs, COMBAT_WRITE_TTL_MS))),
    };
    this.#pending.set(token, entry);
    return entry;
  }

  reject(token: string, approvalProof: string): PendingCombatWrite {
    const entry = this.#validate(token, approvalProof);
    entry.usedAt = new Date(this.now());
    return entry;
  }

  consume(token: string, approvalProof: string): PendingCombatWrite {
    const entry = this.#validate(token, approvalProof);
    entry.usedAt = new Date(this.now());
    return entry;
  }

  #validate(token: string, approvalProof: string): PendingCombatWrite {
    const entry = this.#pending.get(token);
    if (!entry) throw new CombatWriteTokenError("not_found", "Combat-write token not found.");
    if (!approvalProof || approvalProof !== entry.approvalProof) throw new CombatWriteTokenError("not_authorized", "This combat-write approval did not originate from the authenticated Foundry GM window.");
    if (entry.usedAt) throw new CombatWriteTokenError("already_used", "This combat-write token has already been used.");
    if (entry.expiresAt.getTime() <= this.now()) {
      this.#pending.delete(token);
      throw new CombatWriteTokenError("expired", "This combat-write token has expired.");
    }
    return entry;
  }

  #evictExpired(): void {
    for (const [token, entry] of this.#pending) if (entry.expiresAt.getTime() <= this.now()) this.#pending.delete(token);
  }
}

export class CombatWriteTokenError extends Error {
  constructor(public readonly reason: "not_found" | "not_authorized" | "already_used" | "expired", message: string) {
    super(message);
    this.name = "CombatWriteTokenError";
  }
}
