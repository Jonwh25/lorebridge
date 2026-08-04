import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  GitHubAdapter,
  GitHubAdapterError,
  resolveCampaignPath,
  createGitHubAdapter,
  type BackupFile,
} from "./github-adapter.js";
import type { GitHubAdapterConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG: GitHubAdapterConfig = {
  token: "ghp_test_token",
  owner: "test-owner",
  repo: "test-repo",
  branch: "main",
  campaignRoot: "campaign",
};

type MockFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

function makeFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }): MockFetch {
  return async (url, init) => {
    const { status, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

function okFetch(body: unknown, status = 200): MockFetch {
  return makeFetch(() => ({ status, body }));
}

function errorFetch(status: number): MockFetch {
  return makeFetch(() => ({ status, body: { message: "error" } }));
}

// ---------------------------------------------------------------------------
// resolveCampaignPath
// ---------------------------------------------------------------------------

describe("resolveCampaignPath", () => {
  it("resolves a simple relative path", () => {
    assert.equal(resolveCampaignPath("campaign", "entries/npc.md"), "campaign/entries/npc.md");
  });

  it("strips leading slashes from campaign root", () => {
    assert.equal(resolveCampaignPath("/campaign/", "file.md"), "campaign/file.md");
  });

  it("resolves dot-dot within bounds", () => {
    assert.equal(resolveCampaignPath("campaign", "a/b/../c.md"), "campaign/a/c.md");
  });

  it("rejects dot-dot escaping the root", () => {
    assert.throws(
      () => resolveCampaignPath("campaign", "../secret.txt"),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });

  it("rejects absolute paths", () => {
    assert.throws(
      () => resolveCampaignPath("campaign", "/etc/passwd"),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });

  it("rejects empty path", () => {
    assert.throws(
      () => resolveCampaignPath("campaign", ""),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });

  it("rejects path that resolves to campaign root itself", () => {
    assert.throws(
      () => resolveCampaignPath("campaign", "."),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });

  it("rejects path exceeding max length", () => {
    assert.throws(
      () => resolveCampaignPath("campaign", "a".repeat(1025)),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });
});

// ---------------------------------------------------------------------------
// createGitHubAdapter factory
// ---------------------------------------------------------------------------

describe("createGitHubAdapter", () => {
  it("returns null when config is undefined", () => {
    assert.equal(createGitHubAdapter(undefined), null);
  });

  it("returns a GitHubAdapter when config is provided", () => {
    const adapter = createGitHubAdapter(CONFIG, okFetch({}));
    assert.ok(adapter instanceof GitHubAdapter);
  });
});

// ---------------------------------------------------------------------------
// GitHubAdapter.verifyAccess
// ---------------------------------------------------------------------------

describe("GitHubAdapter.verifyAccess", () => {
  it("returns repository info for a private repo", async () => {
    const fetch = okFetch({ name: "test-repo", full_name: "test-owner/test-repo", private: true, default_branch: "main" });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    const info = await adapter.verifyAccess();
    assert.equal(info.name, "test-repo");
    assert.equal(info.fullName, "test-owner/test-repo");
    assert.equal(info.isPrivate, true);
    assert.equal(info.defaultBranch, "main");
  });

  it("rejects a public repository", async () => {
    const fetch = okFetch({ name: "test-repo", full_name: "test-owner/test-repo", private: false, default_branch: "main" });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await assert.rejects(
      () => adapter.verifyAccess(),
      (e) => e instanceof GitHubAdapterError && e.code === "access_denied",
    );
  });

  it("maps 401 to access_denied", async () => {
    const adapter = new GitHubAdapter(CONFIG, errorFetch(401));
    await assert.rejects(
      () => adapter.verifyAccess(),
      (e) => e instanceof GitHubAdapterError && e.code === "access_denied",
    );
  });

  it("maps 403 to access_denied", async () => {
    const adapter = new GitHubAdapter(CONFIG, errorFetch(403));
    await assert.rejects(
      () => adapter.verifyAccess(),
      (e) => e instanceof GitHubAdapterError && e.code === "access_denied",
    );
  });

  it("maps 404 to not_found", async () => {
    const adapter = new GitHubAdapter(CONFIG, errorFetch(404));
    await assert.rejects(
      () => adapter.verifyAccess(),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });

  it("maps 429 to rate_limited", async () => {
    const adapter = new GitHubAdapter(CONFIG, errorFetch(429));
    await assert.rejects(
      () => adapter.verifyAccess(),
      (e) => e instanceof GitHubAdapterError && e.code === "rate_limited",
    );
  });

  it("maps 500 to api_error", async () => {
    const adapter = new GitHubAdapter(CONFIG, errorFetch(500));
    await assert.rejects(
      () => adapter.verifyAccess(),
      (e) => e instanceof GitHubAdapterError && e.code === "api_error",
    );
  });

  it("does not include the token in error messages", async () => {
    const adapter = new GitHubAdapter(CONFIG, errorFetch(401));
    try {
      await adapter.verifyAccess();
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof GitHubAdapterError);
      assert.ok(!e.message.includes(CONFIG.token), "Token must not appear in error message");
    }
  });

  it("sends the Authorization header with the token", async () => {
    let capturedAuth = "";
    const fetch = makeFetch((_, init) => {
      capturedAuth = (init?.headers as Record<string, string>)?.["authorization"] ?? "";
      return { status: 200, body: { name: "r", full_name: "o/r", private: true, default_branch: "main" } };
    });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await adapter.verifyAccess();
    assert.equal(capturedAuth, `Bearer ${CONFIG.token}`);
  });
});

// ---------------------------------------------------------------------------
// GitHubAdapter.readFile
// ---------------------------------------------------------------------------

describe("GitHubAdapter.readFile", () => {
  it("decodes base64 file content", async () => {
    const content = "Hello, campaign!";
    const b64 = Buffer.from(content, "utf8").toString("base64");
    const fetch = okFetch({ type: "file", content: b64 });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    const result = await adapter.readFile("entries/npc.md");
    assert.equal(result, content);
  });

  it("rejects path traversal", async () => {
    const adapter = new GitHubAdapter(CONFIG, okFetch({}));
    await assert.rejects(
      () => adapter.readFile("../../etc/passwd"),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });

  it("rejects directory entries (type != file)", async () => {
    const fetch = okFetch({ type: "dir", content: null });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await assert.rejects(
      () => adapter.readFile("entries"),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
  });

  it("includes the correct ref query parameter", async () => {
    let capturedUrl = "";
    const fetch = makeFetch((url) => {
      capturedUrl = url;
      return { status: 200, body: { type: "file", content: Buffer.from("x").toString("base64") } };
    });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await adapter.readFile("notes/session.md");
    assert.ok(capturedUrl.includes("?ref=main"), `Expected ?ref=main in URL, got: ${capturedUrl}`);
    assert.ok(capturedUrl.includes("campaign/notes/session.md"), `Expected campaign path in URL, got: ${capturedUrl}`);
  });
});

// ---------------------------------------------------------------------------
// GitHubAdapter.listCommits
// ---------------------------------------------------------------------------

describe("GitHubAdapter.listCommits", () => {
  const sampleCommits = [
    {
      sha: "abc123",
      commit: { message: "First commit\n\nBody", author: { name: "Test User", date: "2024-01-01T00:00:00Z" } },
      html_url: "https://github.com/test-owner/test-repo/commit/abc123",
    },
    {
      sha: "def456",
      commit: { message: "Second commit", author: { name: "Another User", date: "2024-01-02T00:00:00Z" } },
      html_url: "https://github.com/test-owner/test-repo/commit/def456",
    },
  ];

  it("returns mapped commit records", async () => {
    const fetch = okFetch(sampleCommits);
    const adapter = new GitHubAdapter(CONFIG, fetch);
    const commits = await adapter.listCommits();
    assert.equal(commits.length, 2);
    assert.equal(commits[0]!.sha, "abc123");
    assert.equal(commits[0]!.message, "First commit");
    assert.equal(commits[0]!.author, "Test User");
    assert.equal(commits[0]!.committedAt, "2024-01-01T00:00:00Z");
  });

  it("caps limit at 20", async () => {
    let capturedUrl = "";
    const fetch = makeFetch((url) => {
      capturedUrl = url;
      return { status: 200, body: [] };
    });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await adapter.listCommits(100);
    assert.ok(capturedUrl.includes("per_page=20"), `Expected per_page=20, got: ${capturedUrl}`);
  });

  it("filters by campaign root path", async () => {
    let capturedUrl = "";
    const fetch = makeFetch((url) => {
      capturedUrl = url;
      return { status: 200, body: [] };
    });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await adapter.listCommits(5);
    assert.ok(capturedUrl.includes("path=campaign"), `Expected path=campaign in URL, got: ${capturedUrl}`);
  });
});

// ---------------------------------------------------------------------------
// GitHubAdapter.createBackupCommit
// ---------------------------------------------------------------------------

describe("GitHubAdapter.createBackupCommit", () => {
  const files: BackupFile[] = [
    { path: "entries/npc.md", content: "# Strahd\n\nVampire lord." },
    { path: "ravens-eye.yaml", content: "specification: 0.1.0-experimental\n" },
  ];

  function makeCommitFetch(overrides: Record<string, unknown> = {}): MockFetch {
    let callCount = 0;
    return makeFetch((url, init) => {
      callCount++;
      const method = (init?.method ?? "GET").toUpperCase();
      // GET ref
      if (method === "GET" && url.includes("/git/refs/")) {
        return { status: 200, body: { object: { sha: "head-sha-1" } } };
      }
      // GET commit
      if (method === "GET" && url.includes("/git/commits/")) {
        return { status: 200, body: { tree: { sha: "base-tree-sha" } } };
      }
      // POST blob
      if (method === "POST" && url.includes("/git/blobs")) {
        return { status: 201, body: { sha: `blob-sha-${callCount}` } };
      }
      // POST tree
      if (method === "POST" && url.includes("/git/trees")) {
        return { status: 201, body: { sha: "new-tree-sha" } };
      }
      // POST commit
      if (method === "POST" && url.includes("/git/commits")) {
        return { status: 201, body: { sha: "new-commit-sha", html_url: "https://github.com/test-owner/test-repo/commit/new-commit-sha", ...overrides } };
      }
      // PATCH ref
      if (method === "PATCH" && url.includes("/git/refs/")) {
        return { status: 200, body: { object: { sha: "new-commit-sha" } } };
      }
      return { status: 500, body: { message: "unexpected" } };
    });
  }

  it("returns a BackupResult with sha and filesCommitted", async () => {
    const adapter = new GitHubAdapter(CONFIG, makeCommitFetch());
    const result = await adapter.createBackupCommit("Backup: session 12", files);
    assert.equal(result.sha, "new-commit-sha");
    assert.equal(result.filesCommitted, 2);
  });

  it("uses force:false in the PATCH ref body", async () => {
    let patchBody: unknown;
    const fetch = makeFetch((url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.includes("/git/refs/")) return { status: 200, body: { object: { sha: "h" } } };
      if (method === "GET" && url.includes("/git/commits/")) return { status: 200, body: { tree: { sha: "t" } } };
      if (method === "POST" && url.includes("/git/blobs")) return { status: 201, body: { sha: "b" } };
      if (method === "POST" && url.includes("/git/trees")) return { status: 201, body: { sha: "tr" } };
      if (method === "POST" && url.includes("/git/commits")) return { status: 201, body: { sha: "c", html_url: "" } };
      if (method === "PATCH" && url.includes("/git/refs/")) {
        patchBody = JSON.parse(init?.body as string);
        return { status: 200, body: { object: { sha: "c" } } };
      }
      return { status: 500, body: {} };
    });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await adapter.createBackupCommit("test", files);
    assert.deepEqual((patchBody as Record<string, unknown>).force, false);
  });

  it("maps 422 from PATCH ref to conflict error", async () => {
    const fetch = makeFetch((url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.includes("/git/refs/")) return { status: 200, body: { object: { sha: "h" } } };
      if (method === "GET" && url.includes("/git/commits/")) return { status: 200, body: { tree: { sha: "t" } } };
      if (method === "POST" && url.includes("/git/blobs")) return { status: 201, body: { sha: "b" } };
      if (method === "POST" && url.includes("/git/trees")) return { status: 201, body: { sha: "tr" } };
      if (method === "POST" && url.includes("/git/commits")) return { status: 201, body: { sha: "c", html_url: "" } };
      if (method === "PATCH") return { status: 422, body: { message: "not fast-forward" } };
      return { status: 500, body: {} };
    });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await assert.rejects(
      () => adapter.createBackupCommit("test", files),
      (e) => e instanceof GitHubAdapterError && e.code === "conflict",
    );
  });

  it("rejects when files array is empty", async () => {
    const adapter = new GitHubAdapter(CONFIG, okFetch({}));
    await assert.rejects(
      () => adapter.createBackupCommit("empty", []),
      (e) => e instanceof GitHubAdapterError && e.code === "api_error",
    );
  });

  it("rejects path traversal in file list before making any API call", async () => {
    let callCount = 0;
    const fetch = makeFetch(() => { callCount++; return { status: 200, body: {} }; });
    const adapter = new GitHubAdapter(CONFIG, fetch);
    await assert.rejects(
      () => adapter.createBackupCommit("test", [{ path: "../../exploit", content: "bad" }]),
      (e) => e instanceof GitHubAdapterError && e.code === "not_found",
    );
    assert.equal(callCount, 0, "No GitHub API calls should be made before path validation");
  });

  it("does not include token in error messages", async () => {
    const adapter = new GitHubAdapter(CONFIG, errorFetch(403));
    try {
      await adapter.createBackupCommit("test", files);
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof GitHubAdapterError);
      assert.ok(!e.message.includes(CONFIG.token), "Token must not appear in error message");
    }
  });
});

// ---------------------------------------------------------------------------
// Token never in error messages (cross-cutting security check)
// ---------------------------------------------------------------------------

describe("Token security", () => {
  it("does not expose the token in any GitHubAdapterError message", async () => {
    const statuses = [401, 403, 404, 422, 429, 500];
    for (const status of statuses) {
      const adapter = new GitHubAdapter(CONFIG, errorFetch(status));
      try {
        await adapter.verifyAccess();
      } catch (e) {
        if (e instanceof GitHubAdapterError) {
          assert.ok(
            !e.message.includes(CONFIG.token),
            `Token appeared in error message for status ${status}: ${e.message}`,
          );
        }
      }
    }
  });
});
