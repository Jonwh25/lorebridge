import { randomUUID } from "node:crypto";
import type { CampaignCodexWritePreview } from "@lorebridge/shared/capabilities";
export type CampaignCodexWriteEntry = CampaignCodexWritePreview & { token: string; rationale: string; expiresAt: Date };
export class CampaignCodexWriteTokenError extends Error { constructor(public readonly reason: "not_found" | "expired" | "source_mismatch") { super(reason === "expired" ? "Campaign Codex write token has expired or was already used." : reason === "source_mismatch" ? "Campaign Codex write token does not belong to this Foundry world." : "Campaign Codex write token was not found."); } }
export class CampaignCodexWriteRegistry {
  private readonly entries = new Map<string, CampaignCodexWriteEntry>();
  register(preview: CampaignCodexWritePreview, rationale: string): CampaignCodexWriteEntry { const entry = { ...preview, rationale, token: randomUUID(), expiresAt: new Date(Date.now() + 5 * 60_000) }; this.entries.set(entry.token, entry); return entry; }
  consume(token: string): CampaignCodexWriteEntry { const entry = this.entries.get(token); this.entries.delete(token); if (!entry) throw new CampaignCodexWriteTokenError("not_found"); if (entry.expiresAt.getTime() <= Date.now()) throw new CampaignCodexWriteTokenError("expired"); return entry; }
  verifyAndConsume(token: string, callerSourceId: string): CampaignCodexWriteEntry { const entry = this.entries.get(token); if (!entry) throw new CampaignCodexWriteTokenError("not_found"); if (entry.sourceId !== "unknown" && entry.sourceId !== callerSourceId) throw new CampaignCodexWriteTokenError("source_mismatch"); return this.consume(token); }
  reject(token: string): void { this.consume(token); }
  rejectVerified(token: string, callerSourceId: string): void { this.verifyAndConsume(token, callerSourceId); }
}
