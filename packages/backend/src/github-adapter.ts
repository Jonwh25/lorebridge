import type { GitHubAdapterConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type GitHubAdapterErrorCode =
  | "not_configured"
  | "access_denied"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "api_error";

export class GitHubAdapterError extends Error {
  constructor(
    public readonly code: GitHubAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GitHubAdapterError";
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RepositoryInfo {
  name: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface BackupFile {
  /** Path relative to the campaign root — no leading slash, no ".." segments. */
  path: string;
  /** UTF-8 text content. */
  content: string;
}

export interface BackupResult {
  sha: string;
  url: string;
  filesCommitted: number;
  filesDeleted: number;
}

export interface CommitRecord {
  sha: string;
  message: string;
  author: string;
  committedAt: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Path security
// ---------------------------------------------------------------------------

const CAMPAIGN_ROOT_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/;
const MAX_PATH_LENGTH = 1024;

/**
 * Resolves a caller-supplied relative path against the campaign root and
 * returns the full repository-relative path.
 *
 * Rejects absolute paths, path traversal sequences, and empty inputs.
 * The resulting path is always a descendant of the campaign root.
 */
export function resolveCampaignPath(campaignRoot: string, relativePath: string): string {
  if (!relativePath || !relativePath.trim()) {
    throw new GitHubAdapterError("not_found", "Path must not be empty.");
  }
  if (relativePath.startsWith("/")) {
    throw new GitHubAdapterError("not_found", "Absolute paths are not permitted.");
  }
  if (relativePath.length > MAX_PATH_LENGTH) {
    throw new GitHubAdapterError("not_found", "Path exceeds maximum allowed length.");
  }

  const root = campaignRoot.replace(/^\/+|\/+$/g, "");
  const segments = relativePath.split("/").filter((s) => s.length > 0);
  const resolved: string[] = [];

  for (const seg of segments) {
    if (seg === "..") {
      if (resolved.length === 0) {
        throw new GitHubAdapterError("not_found", "Path is outside the campaign root.");
      }
      resolved.pop();
    } else if (seg !== ".") {
      resolved.push(seg);
    }
  }

  if (resolved.length === 0) {
    throw new GitHubAdapterError("not_found", "Path resolves to the campaign root itself; a file path is required.");
  }

  return `${root}/${resolved.join("/")}`;
}

// ---------------------------------------------------------------------------
// Low-level GitHub REST API helpers
// ---------------------------------------------------------------------------

type FetchFn = typeof globalThis.fetch;

interface GitHubApiOptions {
  method?: string;
  body?: unknown;
}

function safeErrorMessage(status: number, url: string): string {
  // Never include token, owner/repo are already in the URL so safe to echo path only.
  const path = new URL(url).pathname;
  return `GitHub API request to ${path} failed with status ${status}.`;
}

async function callGitHub(
  fetchFn: FetchFn,
  token: string,
  url: string,
  options: GitHubApiOptions = {},
): Promise<unknown> {
  const response = await fetchFn(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "lorebridge-backend",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 401 || response.status === 403) {
    throw new GitHubAdapterError("access_denied", safeErrorMessage(response.status, url));
  }
  if (response.status === 404) {
    throw new GitHubAdapterError("not_found", safeErrorMessage(response.status, url));
  }
  if (response.status === 422) {
    throw new GitHubAdapterError("conflict", "The update was rejected; another commit may have been pushed since this backup was started.");
  }
  if (response.status === 429) {
    throw new GitHubAdapterError("rate_limited", "GitHub API rate limit reached. Please try again later.");
  }
  if (!response.ok) {
    throw new GitHubAdapterError("api_error", safeErrorMessage(response.status, url));
  }

  return response.json() as unknown;
}

// ---------------------------------------------------------------------------
// GitHubAdapter
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";
const MAX_COMMITS = 20;

export class GitHubAdapter {
  private readonly config: GitHubAdapterConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: GitHubAdapterConfig, fetchFn: FetchFn = globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  get owner(): string { return this.config.owner; }
  get repo(): string { return this.config.repo; }
  get branch(): string { return this.config.branch; }
  get campaignRoot(): string { return this.config.campaignRoot; }

  private repoBase(): string {
    return `${GITHUB_API}/repos/${this.config.owner}/${this.config.repo}`;
  }

  private call(url: string, options?: GitHubApiOptions): Promise<unknown> {
    return callGitHub(this.fetchFn, this.config.token, url, options);
  }

  // -------------------------------------------------------------------------
  // verifyAccess — confirms the token can reach the repository.
  // Rejects if the repository is public (backups default to private).
  // -------------------------------------------------------------------------

  async verifyAccess(): Promise<RepositoryInfo> {
    const data = await this.call(this.repoBase()) as Record<string, unknown>;
    const info: RepositoryInfo = {
      name: String(data.name),
      fullName: String(data.full_name),
      isPrivate: Boolean(data.private),
      defaultBranch: String(data.default_branch),
    };
    if (!info.isPrivate) {
      throw new GitHubAdapterError(
        "access_denied",
        `Repository ${info.fullName} is public. Campaign backups must use a private repository.`,
      );
    }
    return info;
  }

  // -------------------------------------------------------------------------
  // readFile — reads one file under the campaign root.
  // -------------------------------------------------------------------------

  async readFile(relativePath: string): Promise<string> {
    const fullPath = resolveCampaignPath(this.config.campaignRoot, relativePath);
    const url = `${this.repoBase()}/contents/${encodeURIPathSegments(fullPath)}?ref=${encodeURIComponent(this.config.branch)}`;
    const data = await this.call(url) as Record<string, unknown>;
    if (data.type !== "file" || typeof data.content !== "string") {
      throw new GitHubAdapterError("not_found", `${fullPath} is not a regular file.`);
    }
    return Buffer.from(data.content as string, "base64").toString("utf8");
  }

  // -------------------------------------------------------------------------
  // readFileAtRef — reads one file under the campaign root at a specific ref.
  // -------------------------------------------------------------------------

  async readFileAtRef(relativePath: string, ref: string): Promise<string> {
    if (!ref || !ref.trim()) {
      throw new GitHubAdapterError("not_found", "Ref must not be empty.");
    }
    const fullPath = resolveCampaignPath(this.config.campaignRoot, relativePath);
    const url = `${this.repoBase()}/contents/${encodeURIPathSegments(fullPath)}?ref=${encodeURIComponent(ref)}`;
    const data = await this.call(url) as Record<string, unknown>;
    if (data.type !== "file" || typeof data.content !== "string") {
      throw new GitHubAdapterError("not_found", `${fullPath} is not a regular file.`);
    }
    return Buffer.from(data.content as string, "base64").toString("utf8");
  }

  // -------------------------------------------------------------------------
  // listCommits — returns bounded commit history within the campaign root.
  // -------------------------------------------------------------------------

  async listCommits(limit = MAX_COMMITS): Promise<CommitRecord[]> {
    const bounded = Math.min(Math.max(1, limit), MAX_COMMITS);
    const url =
      `${this.repoBase()}/commits` +
      `?sha=${encodeURIComponent(this.config.branch)}` +
      `&path=${encodeURIComponent(this.config.campaignRoot)}` +
      `&per_page=${bounded}`;

    let data: unknown[];
    try {
      data = await this.call(url) as unknown[];
    } catch (error) {
      // GitHub returns 409 when the repository has no commits yet — treat as empty.
      if (error instanceof GitHubAdapterError && error.code === "api_error" &&
          error.message.includes("409")) {
        return [];
      }
      throw error;
    }
    return data.map((item) => {
      const c = item as Record<string, unknown>;
      const commit = c.commit as Record<string, unknown>;
      const author = commit.author as Record<string, unknown>;
      return {
        sha: String(c.sha),
        message: String(commit.message).split("\n")[0] ?? "",
        author: String(author?.name ?? "unknown"),
        committedAt: String(author?.date ?? ""),
        url: String(c.html_url ?? ""),
      };
    });
  }

  // -------------------------------------------------------------------------
  // listDirectoryAtRef — lists files in a campaign-root directory at a ref.
  // Returns an empty array when the directory does not exist.
  // -------------------------------------------------------------------------

  async listDirectoryAtRef(
    relativePath: string,
    ref: string,
  ): Promise<Array<{ name: string; sha: string; type: "file" | "dir" }>> {
    const fullPath = resolveCampaignPath(this.config.campaignRoot, relativePath);
    const url = `${this.repoBase()}/contents/${encodeURIPathSegments(fullPath)}?ref=${encodeURIComponent(ref)}`;
    let data: unknown;
    try {
      data = await this.call(url);
    } catch (error) {
      if (error instanceof GitHubAdapterError && error.code === "not_found") {
        return [];
      }
      throw error;
    }
    if (!Array.isArray(data)) {
      return [];
    }
    return (data as Array<Record<string, unknown>>).map((item) => ({
      name: String(item["name"] ?? ""),
      sha: String(item["sha"] ?? ""),
      type: item["type"] === "dir" ? ("dir" as const) : ("file" as const),
    }));
  }

  // -------------------------------------------------------------------------
  // readBlobBySha — fetches a blob's decoded UTF-8 content by its SHA.
  // -------------------------------------------------------------------------

  async readBlobBySha(sha: string): Promise<string> {
    const url = `${this.repoBase()}/git/blobs/${encodeURIComponent(sha)}`;
    const data = await this.call(url) as Record<string, unknown>;
    if (typeof data["content"] !== "string") {
      throw new GitHubAdapterError("api_error", "Blob response missing content field.");
    }
    return Buffer.from((data["content"] as string).replace(/\n/g, ""), "base64").toString("utf8");
  }

  // -------------------------------------------------------------------------
  // listDirectory — lists files in a campaign-root directory at HEAD.
  // Returns an empty array when the directory does not exist.
  // -------------------------------------------------------------------------

  async listDirectory(
    relativePath: string,
  ): Promise<Array<{ name: string; sha: string; type: "file" | "dir" }>> {
    const fullPath = resolveCampaignPath(this.config.campaignRoot, relativePath);
    const url = `${this.repoBase()}/contents/${encodeURIPathSegments(fullPath)}?ref=${encodeURIComponent(this.config.branch)}`;
    let data: unknown;
    try {
      data = await this.call(url);
    } catch (error) {
      if (error instanceof GitHubAdapterError && error.code === "not_found") {
        return [];
      }
      throw error;
    }
    if (!Array.isArray(data)) {
      return [];
    }
    return (data as Array<Record<string, unknown>>).map((item) => ({
      name: String(item["name"] ?? ""),
      sha: String(item["sha"] ?? ""),
      type: item["type"] === "dir" ? ("dir" as const) : ("file" as const),
    }));
  }

  // -------------------------------------------------------------------------
  // createBackupCommit — atomically commits one or more files.
  // Fails fast on non-fast-forward conflicts without overwriting remote work.
  // -------------------------------------------------------------------------

  async createBackupCommit(
    message: string,
    files: BackupFile[],
    deletePaths?: string[],
  ): Promise<BackupResult> {
    if (!files.length && !deletePaths?.length) {
      throw new GitHubAdapterError("api_error", "At least one file or deletion is required for a backup commit.");
    }

    // Validate every path before touching GitHub.
    const resolvedFiles = files.map((f) => ({
      fullPath: resolveCampaignPath(this.config.campaignRoot, f.path),
      content: f.content,
    }));
    const resolvedDeletes = (deletePaths ?? []).map((p) =>
      resolveCampaignPath(this.config.campaignRoot, p),
    );

    // Step 1: get current HEAD SHA (null when the repository is empty).
    const refUrl = `${this.repoBase()}/git/refs/heads/${encodeURIComponent(this.config.branch)}`;
    let headSha: string | null = null;
    let baseTreeSha: string | null = null;

    try {
      const refData = await this.call(refUrl) as Record<string, unknown>;
      headSha = (refData.object as Record<string, unknown>).sha as string;

      // Step 2: get tree SHA of HEAD commit.
      const commitData = await this.call(
        `${this.repoBase()}/git/commits/${headSha}`,
      ) as Record<string, unknown>;
      baseTreeSha = (commitData.tree as Record<string, unknown>).sha as string;
    } catch (error) {
      // 409 = empty repository; 404 = branch doesn't exist yet.
      // The git data API (blobs, trees, commits) is unavailable on a completely
      // uninitialised repo. Bootstrap it via the Contents API, which works on
      // empty repos, then read back the resulting commit/tree SHAs.
      const isEmptyRepo =
        error instanceof GitHubAdapterError &&
        (error.code === "not_found" ||
          (error.code === "api_error" && error.message.includes("409")));
      if (!isEmptyRepo) throw error;

      const initData = await this.call(
        `${this.repoBase()}/contents/.lorebridge`,
        {
          method: "PUT",
          body: {
            message: "Initialize LoreBridge backup repository",
            content: Buffer.from("# LoreBridge Campaign Backup\n").toString("base64"),
          },
        },
      ) as Record<string, unknown>;
      const initCommit = initData.commit as Record<string, unknown>;
      headSha = initCommit.sha as string;
      baseTreeSha = (initCommit.tree as Record<string, unknown>).sha as string;
    }

    // Step 3: create a blob for each file, in batches of 5 to avoid
    // overwhelming the GitHub API with concurrent requests on large exports.
    const BLOB_BATCH_SIZE = 5;
    const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
    for (let i = 0; i < resolvedFiles.length; i += BLOB_BATCH_SIZE) {
      const batch = resolvedFiles.slice(i, i + BLOB_BATCH_SIZE);
      const batchEntries = await Promise.all(
        batch.map(async ({ fullPath, content }) => {
          const blobData = await this.call(`${this.repoBase()}/git/blobs`, {
            method: "POST",
            body: {
              content: Buffer.from(content, "utf8").toString("base64"),
              encoding: "base64",
            },
          }) as Record<string, unknown>;
          return {
            path: fullPath,
            mode: "100644",
            type: "blob",
            sha: blobData.sha as string,
          };
        }),
      );
      treeEntries.push(...batchEntries);
    }
    // Deletions: sha=null removes a file from the tree.
    for (const fullPath of resolvedDeletes) {
      treeEntries.push({ path: fullPath, mode: "100644", type: "blob", sha: null });
    }

    // Step 4: create a new tree (omit base_tree for the initial commit).
    const treeData = await this.call(`${this.repoBase()}/git/trees`, {
      method: "POST",
      body: baseTreeSha
        ? { base_tree: baseTreeSha, tree: treeEntries }
        : { tree: treeEntries },
    }) as Record<string, unknown>;
    const newTreeSha = treeData.sha as string;

    // Step 5: create the commit (omit parents for the initial commit).
    const commitResult = await this.call(`${this.repoBase()}/git/commits`, {
      method: "POST",
      body: {
        message,
        tree: newTreeSha,
        parents: headSha ? [headSha] : [],
      },
    }) as Record<string, unknown>;
    const newCommitSha = commitResult.sha as string;
    const commitUrl = String(commitResult.html_url ?? "");

    // Step 6: update existing ref (force:false → 422 on non-fast-forward),
    // or create the ref for the first commit on an empty repository.
    if (headSha) {
      await this.call(refUrl, {
        method: "PATCH",
        body: { sha: newCommitSha, force: false },
      });
    } else {
      await this.call(`${this.repoBase()}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${this.config.branch}`, sha: newCommitSha },
      });
    }

    return {
      sha: newCommitSha,
      url: commitUrl,
      filesCommitted: files.length,
      filesDeleted: resolvedDeletes.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function encodeURIPathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

// ---------------------------------------------------------------------------
// Factory — returns null when GitHub is not configured.
// ---------------------------------------------------------------------------

export function createGitHubAdapter(
  config: GitHubAdapterConfig | undefined,
  fetchFn?: FetchFn,
): GitHubAdapter | null {
  if (!config) return null;
  return new GitHubAdapter(config, fetchFn);
}
