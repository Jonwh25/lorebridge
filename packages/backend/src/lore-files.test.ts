import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { GitHubAdapter } from "./github-adapter.js";
import { createLoreBridgeServer } from "./app.js";
import { LoreFileHashCache } from "./lore-file-hash-cache.js";

const config = { owner: "owner", repo: "repo", branch: "main", campaignRoot: "campaign", token: "secret-token" };
const files = [{ path: "npc.md", content: "# NPC\nSecret biography" }, { path: "quest.md", content: "# Quest" }];

function mockGitHub() {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  let fail = false;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {} });
    if (fail) return Response.json({ message: "Unavailable" }, { status: 500 });
    if (method === "GET" && url.includes("/git/refs/")) return Response.json({ object: { sha: "head" } });
    if (method === "GET" && url.includes("/git/commits/")) return Response.json({ tree: { sha: "tree" } });
    return Response.json({ sha: "new-sha", html_url: "https://github.com/owner/repo/commit/new-sha" });
  };
  return { calls, fetchFn, setFail(value: boolean) { fail = value; } };
}

test("lore export persists hashes across restarts, skips all API calls, and commits only edits", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lb-hashes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const github = mockGitHub();
  let adapter = new GitHubAdapter(config, github.fetchFn, dir);
  assert.equal((await adapter.createLoreFilesCommit("first", files)).committed, 2);
  const disk = await readFile(path.join(dir, "cc-export-hashes.json"), "utf8");
  for (const secret of [config.token, files[0]!.content, "npc.md"]) assert.ok(!disk.includes(secret));
  adapter = new GitHubAdapter(config, github.fetchFn, dir);
  github.calls.length = 0;
  assert.deepEqual(await adapter.createLoreFilesCommit("same", files), { files: [], committed: 0, skipped: 2 });
  assert.equal(github.calls.length, 0);
  const edited = [{ ...files[0]!, content: "Updated" }, files[1]!];
  const result = await adapter.createLoreFilesCommit("edit", edited);
  assert.deepEqual([result.committed, result.skipped, result.files], [1, 1, ["npc.md"]]);
  const blobs = github.calls.filter((call) => call.url.endsWith("/git/blobs"));
  assert.equal(blobs.length, 1);
  assert.equal(Buffer.from(String(blobs[0]!.body.content), "base64").toString("utf8"), "Updated");
});

test("cache isolates repositories, branches, roots and canonicalizes equivalent paths", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lb-hashes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const github = mockGitHub();
  const adapter = new GitHubAdapter(config, github.fetchFn, dir);
  await adapter.createLoreFilesCommit("first", files);
  for (const override of [{ owner: "other" }, { repo: "other" }, { branch: "other" }, { campaignRoot: "other" }]) {
    assert.equal((await new GitHubAdapter({ ...config, ...override }, github.fetchFn, dir).createLoreFilesCommit("other", files)).committed, 2);
  }
  assert.equal((await adapter.createLoreFilesCommit("root", files, [], "")).committed, 2);
  assert.equal((await adapter.createLoreFilesCommit("alias", [{ ...files[0]!, path: "./npc.md" }])).skipped, 1);
  github.calls.length = 0;
  await assert.rejects(adapter.createLoreFilesCommit("bad", [{ path: "../../escape", content: "bad" }]), /outside/);
  await assert.rejects(adapter.createLoreFilesCommit("duplicates", [files[0]!, { ...files[0]!, path: "./npc.md", content: "different" }]), /same resolved/);
  assert.equal(github.calls.length, 0);
});

test("deletions, failed writes, and other backup routes cannot leave trusted stale hashes", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lb-hashes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const github = mockGitHub();
  const adapter = new GitHubAdapter(config, github.fetchFn, dir);
  await adapter.createLoreFilesCommit("first", files);
  const deletion = await adapter.createLoreFilesCommit("delete", [], ["npc.md"]);
  assert.equal(deletion.committed, 0);
  assert.equal(deletion.commit?.filesDeleted, 1);
  assert.equal((await adapter.createLoreFilesCommit("restore", files)).committed, 1);
  await adapter.createBackupCommit("other route", [{ ...files[0]!, content: "Other content" }]);
  assert.equal((await adapter.createLoreFilesCommit("restore again", files)).committed, 1);
  github.setFail(true);
  await assert.rejects(adapter.createLoreFilesCommit("fails", [{ ...files[0]!, content: "Edit" }]));
  github.setFail(false);
  assert.equal((await new GitHubAdapter(config, github.fetchFn, dir).createLoreFilesCommit("retry", files)).committed, 1);
});

test("missing, malformed, and unsupported caches cause full exports; concurrent chunks are serialized", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lb-hashes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const github = mockGitHub();
  const adapter = new GitHubAdapter(config, github.fetchFn, dir);
  for (const cache of ["{broken", '{"version":2,"hashes":{}}', '{"version":1,"hashes":{"bad":"bad"}}']) {
    await writeFile(path.join(dir, "cc-export-hashes.json"), cache);
    assert.equal((await adapter.createLoreFilesCommit("recover", files)).committed, 2);
  }
  await rm(path.join(dir, "cc-export-hashes.json"));
  const [first, second] = await Promise.all([
    adapter.createLoreFilesCommit("first", files), adapter.createLoreFilesCommit("second", files),
  ]);
  assert.equal(first.committed, 2);
  assert.equal(second.skipped, 2);
  assert.deepEqual(await adapter.createLoreFilesCommit("empty", []), { files: [], committed: 0, skipped: 0 });
});

test("unwritable cache blocks mutation, and a post-commit save failure preserves safe invalidation", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lb-hashes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const blocker = path.join(dir, "blocker");
  await writeFile(blocker, "not a directory");
  const github = mockGitHub();
  await assert.rejects(new GitHubAdapter(config, github.fetchFn, blocker).createLoreFilesCommit("blocked", files));
  assert.equal(github.calls.length, 0);
  const cache = new LoreFileHashCache(dir);
  const result = await cache.run(["destination"], files, [], true, async () => {
    // Simulate a disk failure after GitHub succeeds, without mocking private methods.
    await rm(path.join(dir, "cc-export-hashes.json"));
    await mkdir(path.join(dir, "cc-export-hashes.json"));
    return { sha: "success", url: "url", filesCommitted: 2, filesDeleted: 0 };
  });
  assert.equal(result.commit?.sha, "success");
});

test("lore-files HTTP route authenticates, validates paths, and returns exact no-op counts", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lb-hashes-route-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const github = mockGitHub();
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) =>
    String(input).startsWith("https://api.github.com/") ? github.fetchFn(input, init) : originalFetch(input, init));
  const server = createLoreBridgeServer({ host: "127.0.0.1", port: 0, pairingEnabled: true, pairingTtlSeconds: 300, dataDir: dir, github: config },
    { id: "test", secret: "test-secret", createdAt: "2026-09-02", fingerprint: "test" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (endpoint: string, body: unknown, token?: string) => fetch(`${base}${endpoint}`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  const endpoint = "/v1/backup/github/lore-files";
  assert.equal((await post(endpoint, { files })).status, 401);
  const start = await (await post("/v1/pairing/start", {})).json() as { code: string };
  const paired = await (await post("/v1/pairing/complete", { code: start.code, clientName: "Test" })).json() as { token: string };
  assert.equal((await post(endpoint, { files: [{ path: "../../escape", content: "no" }] }, paired.token)).status, 400);
  const first = await post(endpoint, { files }, paired.token);
  assert.equal(first.status, 200);
  assert.equal((await first.json() as { committed: number }).committed, 2);
  github.calls.length = 0;
  const second = await post(endpoint, { files }, paired.token);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { files: [], committed: 0, skipped: 2 });
  assert.equal(github.calls.length, 0);
  assert.deepEqual(await (await post(endpoint, { files: [] }, paired.token)).json(), { files: [], committed: 0, skipped: 0 });
});
