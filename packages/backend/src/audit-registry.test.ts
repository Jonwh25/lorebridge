/**
 * Unit tests for AuditRegistry — rollback token lifecycle.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuditRegistry, AuditTokenError } from "./audit-registry.js";

const ENTRY_BASE = {
  journalId: "jrn1",
  pageId: "pg1",
  pageName: "The Drowned Market",
  journalName: "World Notes",
  sourceId: "src-1",
  previousContent: "<p>Old content.</p>",
  newContent: "<p>New AI content.</p>",
};

describe("AuditRegistry.record", () => {
  it("returns an entry with a unique auditToken and 30-minute TTL", () => {
    const reg = new AuditRegistry();
    const before = Date.now();
    const entry = reg.record(ENTRY_BASE);
    const after = Date.now();

    assert.ok(entry.auditToken.length > 0);
    assert.equal(entry.journalId, ENTRY_BASE.journalId);
    assert.equal(entry.previousContent, ENTRY_BASE.previousContent);
    assert.ok(entry.approvedAt.getTime() >= before);
    assert.ok(entry.approvedAt.getTime() <= after);
    assert.ok(entry.expiresAt.getTime() - entry.approvedAt.getTime() >= 29 * 60 * 1000);
  });

  it("assigns distinct tokens for separate records", () => {
    const reg = new AuditRegistry();
    const a = reg.record(ENTRY_BASE);
    const b = reg.record(ENTRY_BASE);
    assert.notEqual(a.auditToken, b.auditToken);
  });
});

describe("AuditRegistry.consume", () => {
  it("returns the entry and marks it rolled back on first consume", () => {
    const reg = new AuditRegistry();
    const entry = reg.record(ENTRY_BASE);
    const consumed = reg.consume(entry.auditToken);
    assert.equal(consumed.auditToken, entry.auditToken);
    assert.ok(consumed.rolledBackAt instanceof Date);
  });

  it("throws already_used on second consume", () => {
    const reg = new AuditRegistry();
    const entry = reg.record(ENTRY_BASE);
    reg.consume(entry.auditToken);
    assert.throws(
      () => reg.consume(entry.auditToken),
      (err) => err instanceof AuditTokenError && err.reason === "already_used",
    );
  });

  it("throws not_found for an unknown token", () => {
    const reg = new AuditRegistry();
    assert.throws(
      () => reg.consume("00000000-0000-0000-0000-000000000000"),
      (err) => err instanceof AuditTokenError && err.reason === "not_found",
    );
  });
});
