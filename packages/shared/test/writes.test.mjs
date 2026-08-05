import assert from "node:assert/strict";
import test from "node:test";
import { validateApproveWriteResult } from "../dist/capabilities.js";

test("validateApproveWriteResult accepts a valid result", () => {
  const result = validateApproveWriteResult({
    journalId: "jrn_123",
    pageId: "pg_456",
    pageName: "The Old Windmill",
    proposedContent: "<p>Updated content.</p>",
  });
  assert.equal(result.valid, true);
  assert.equal(result.value?.journalId, "jrn_123");
  assert.equal(result.value?.pageName, "The Old Windmill");
});

test("validateApproveWriteResult accepts optional auditToken and auditExpiresAt", () => {
  const result = validateApproveWriteResult({
    journalId: "jrn_123",
    pageId: "pg_456",
    pageName: "The Old Windmill",
    proposedContent: "<p>Updated content.</p>",
    auditToken: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    auditExpiresAt: "2026-08-05T12:30:00.000Z",
  });
  assert.equal(result.valid, true);
  assert.equal(result.value?.auditToken, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(result.value?.auditExpiresAt, "2026-08-05T12:30:00.000Z");
});

test("validateApproveWriteResult rejects non-object", () => {
  assert.equal(validateApproveWriteResult(null).valid, false);
  assert.equal(validateApproveWriteResult("string").valid, false);
  assert.equal(validateApproveWriteResult(42).valid, false);
});

test("validateApproveWriteResult rejects missing fields", () => {
  const result = validateApproveWriteResult({ journalId: "j", pageId: "p" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("pageName")));
});

test("validateApproveWriteResult rejects empty strings", () => {
  const result = validateApproveWriteResult({
    journalId: "",
    pageId: "p",
    pageName: "name",
    proposedContent: "<p>x</p>",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("journalId")));
});

test("validateApproveWriteResult rejects empty proposedContent", () => {
  const result = validateApproveWriteResult({
    journalId: "j",
    pageId: "p",
    pageName: "name",
    proposedContent: "",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("proposedContent")));
});
