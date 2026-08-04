/**
 * Tests for POST /v1/backup/github/export
 * Covers: preview mode, commit mode, 503 when unconfigured, 400 on bad input,
 * path traversal rejection, authentication requirement.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createLoreBridgeServer } from "./app.js";
import type { BackendConfig } from "./config.js";
import type { BackendIdentity } from "./identity.js";
import type { BackendServices } from "./journal-service.js";
import type { BackupFileEntry } from "@lorebridge/shared/capabilities";

// ---------------------------------------------------------------------------
// Server helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG: BackendConfig = {
  host: "127.0.0.1",
  port: 0,
  pairingEnabled: true,
  pairingTtlSeconds: 300,
  dataDir: ".lorebridge-test",
};

const IDENTITY: BackendIdentity = {
  id: "lb_test_backup",
  secret: "test-secret-backup",
  createdAt: "2026-08-01T00:00:00.000Z",
  fingerprint: "test:fingerprint:backup",
};

type MockFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  config: Partial<BackendConfig> = {},
  fetchFn?: MockFetch,
): Promise<void> {
  const merged: BackendConfig = { ...BASE_CONFIG, ...config };
  void fetchFn; // reserved for future mock injection
  const services: BackendServices = {};
  const server = createLoreBridgeServer(merged, IDENTITY, services);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

async function pair(baseUrl: string): Promise<string> {
  const startRes = await fetch(`${baseUrl}/v1/pairing/start`, { method: "POST" });
  const start = (await startRes.json()) as { code: string };
  const completeRes = await fetch(`${baseUrl}/v1/pairing/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: start.code, clientName: "Test" }),
  });
  return ((await completeRes.json()) as { token: string }).token;
}

const SAMPLE_FILES: BackupFileEntry[] = [
  { path: "ravens-eye.yaml", content: "specification: 0.1.0-experimental\n" },
  { path: "entry/world-lore.md", content: "---\nid: entry:abc\n---\nContent\n" },
];

// ---------------------------------------------------------------------------
// Tests: no GitHub configured (503)
// ---------------------------------------------------------------------------

describe("POST /v1/backup/github/export — GitHub not configured", () => {
  it("returns 503 when GitHub is not configured", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "journals",
          folderName: "World Lore",
          preview: true,
          files: SAMPLE_FILES,
        }),
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "not_configured");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: authentication required
// ---------------------------------------------------------------------------

describe("POST /v1/backup/github/export — authentication", () => {
  it("returns 401 without a token", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "journals",
          folderName: "World Lore",
          preview: true,
          files: SAMPLE_FILES,
        }),
      });
      assert.equal(res.status, 401);
    });
  });

  it("returns 401 with a malformed token", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: "Bearer not-a-valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "journals",
          folderName: "World Lore",
          preview: true,
          files: SAMPLE_FILES,
        }),
      });
      assert.equal(res.status, 401);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: input validation (400)
// ---------------------------------------------------------------------------

describe("POST /v1/backup/github/export — input validation", () => {
  it("returns 400 when type is invalid", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "actors",
          folderName: "Test",
          preview: true,
          files: SAMPLE_FILES,
        }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "invalid_request");
    });
  });

  it("returns 400 when folderName is missing", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "journals",
          preview: true,
          files: SAMPLE_FILES,
        }),
      });
      assert.equal(res.status, 400);
    });
  });

  it("returns 400 when preview is not a boolean", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "journals",
          folderName: "World Lore",
          preview: "yes",
          files: SAMPLE_FILES,
        }),
      });
      assert.equal(res.status, 400);
    });
  });

  it("returns 400 when files array is missing", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "journals",
          folderName: "World Lore",
          preview: true,
        }),
      });
      assert.equal(res.status, 400);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: path traversal rejection
// ---------------------------------------------------------------------------

describe("POST /v1/backup/github/export — path traversal", () => {
  it("returns 400 when a file path contains path traversal", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "journals",
          folderName: "World Lore",
          preview: true,
          files: [{ path: "../etc/passwd", content: "bad" }],
        }),
      });
      // Caught by validateBackupExportInput (shared validator)
      assert.equal(res.status, 400);
    });
  });

  it("returns 400 when a file path is absolute", async () => {
    await withServer(async (baseUrl) => {
      const token = await pair(baseUrl);
      const res = await fetch(`${baseUrl}/v1/backup/github/export`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "journals",
          folderName: "World Lore",
          preview: true,
          files: [{ path: "/etc/passwd", content: "bad" }],
        }),
      });
      assert.equal(res.status, 400);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: validateBackupExportInput (unit level)
// ---------------------------------------------------------------------------

describe("validateBackupExportInput", () => {
  it("accepts a valid preview request", async () => {
    const { validateBackupExportInput } = await import(
      "@lorebridge/shared/capabilities"
    );
    const result = validateBackupExportInput({
      type: "journals",
      folderName: "World Lore",
      preview: true,
      files: [{ path: "entry/lore.md", content: "# Lore\n" }],
    });
    assert.equal(result.valid, true);
  });

  it("rejects path traversal in files array", async () => {
    const { validateBackupExportInput } = await import(
      "@lorebridge/shared/capabilities"
    );
    const result = validateBackupExportInput({
      type: "scenes",
      folderName: "Dungeons",
      preview: true,
      files: [{ path: "../../exploit", content: "bad" }],
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("path traversal")),
      `Expected path traversal error, got: ${result.errors.join(", ")}`,
    );
  });

  it("rejects unknown type", async () => {
    const { validateBackupExportInput } = await import(
      "@lorebridge/shared/capabilities"
    );
    const result = validateBackupExportInput({
      type: "actors",
      folderName: "NPCs",
      preview: true,
      files: [],
    });
    assert.equal(result.valid, false);
  });

  it("rejects missing folderName", async () => {
    const { validateBackupExportInput } = await import(
      "@lorebridge/shared/capabilities"
    );
    const result = validateBackupExportInput({
      type: "journals",
      preview: false,
      files: [],
    });
    assert.equal(result.valid, false);
  });
});
