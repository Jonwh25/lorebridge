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

    const data = await this.call(url) as unknown[];
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
  // createBackupCommit — atomically commits one or more files.
  // Fails fast on non-fast-forward conflicts without overwriting remote work.
  // -------------------------------------------------------------------------

  async createBackupCommit(
    message: string,
    files: BackupFile[],
  ): Promise<BackupResult> {
    if (!files.length) {
      throw new GitHubAdapterError("api_error", "At least one file is required for a backup commit.");
    }

    // Validate every path before touching GitHub.
    const resolvedFiles = files.map((f) => ({
      fullPath: resolveCampaignPath(this.config.campaignRoot, f.path),
      content: f.content,
    }));

    // Step 1: get current HEAD SHA.
    const refUrl = `${this.repoBase()}/git/refs/heads/${encodeURIComponent(this.config.branch)}`;
    const refData = await this.call(refUrl) as Record<string, unknown>;
    const headSha = (refData.object as Record<string, unknown>).sha as string;

    // Step 2: get tree SHA of HEAD commit.
    const commitData = await this.call(
      `${this.repoBase()}/git/commits/${headSha}`,
    ) as Record<string, unknown>;
    const baseTreeSha = (commitData.tree as Record<string, unknown>).sha as string;

    // Step 3: create a blob for each file.
    const treeEntries = await Promise.all(
      resolvedFiles.map(async ({ fullPath, content }) => {
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

    // Step 4: create a new tree.
    const treeData = await this.call(`${this.repoBase()}/git/trees`, {
      method: "POST",
      body: { base_tree: baseTreeSha, tree: treeEntries },
    }) as Record<string, unknown>;
    const newTreeSha = treeData.sha as string;

    // Step 5: create the commit.
    const commitResult = await this.call(`${this.repoBase()}/git/commits`, {
      method: "POST",
      body: {
        message,
        tree: newTreeSha,
        parents: [headSha],
      },
    }) as Record<string, unknown>;
    const newCommitSha = commitResult.sha as string;
    const commitUrl = String(commitResult.html_url ?? "");

    // Step 6: update the ref (force:false → 422 on non-fast-forward).
    await this.call(refUrl, {
      method: "PATCH",
      body: { sha: newCommitSha, force: false },
    });

    return {
      sha: newCommitSha,
      url: commitUrl,
      filesCommitted: files.length,
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
