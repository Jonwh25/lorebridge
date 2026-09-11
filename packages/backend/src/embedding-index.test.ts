import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EmbeddingIndexService } from "./embedding-index.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "lb-embedding-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function makeEmbedFn(dim = 4): (texts: string[]) => Promise<number[][]> {
  return async (texts) =>
    texts.map((_, i) => Array.from({ length: dim }, (__, j) => (i === j ? 1 : 0)));
}

test("EmbeddingIndexService: load on missing file gives empty index", async () => {
  await withTempDir(async (dir) => {
    const svc = new EmbeddingIndexService(dir);
    assert.equal(svc.isLoaded, false);
    assert.equal(svc.entryCount, 0);
    await svc.load();
    assert.equal(svc.isLoaded, true);
    assert.equal(svc.entryCount, 0);
  });
});

test("EmbeddingIndexService: rebuild persists and query returns results", async () => {
  await withTempDir(async (dir) => {
    const svc = new EmbeddingIndexService(dir);
    const items = [
      { uuid: "u1", documentType: "journal" as const, name: "Tser Falls", text: "A waterfall." },
      { uuid: "u2", documentType: "actor" as const, name: "Strahd", text: "Vampire lord." },
      { uuid: "u3", documentType: "journal" as const, name: "Castle Ravenloft", text: "Dark castle." },
    ];
    await svc.rebuild(items, makeEmbedFn(3));
    assert.equal(svc.entryCount, 3);

    // Top result for vector [1,0,0] should be the first item (cosine 1).
    const results = svc.query([1, 0, 0], 2);
    assert.equal(results.length, 2);
    assert.equal(results[0]!.entry.uuid, "u1");
    assert.ok(results[0]!.score > 0.99);

    // Filter by type.
    const actorOnly = svc.query([0, 1, 0], 5, ["actor"]);
    assert.equal(actorOnly.length, 1);
    assert.equal(actorOnly[0]!.entry.uuid, "u2");
  });
});

test("EmbeddingIndexService: survives round-trip through disk", async () => {
  await withTempDir(async (dir) => {
    const svc = new EmbeddingIndexService(dir);
    await svc.rebuild(
      [{ uuid: "u1", documentType: "journal" as const, name: "Page", text: "content" }],
      makeEmbedFn(2),
    );
    assert.equal(svc.entryCount, 1);

    const svc2 = new EmbeddingIndexService(dir);
    assert.equal(svc2.isLoaded, false);
    await svc2.load();
    assert.equal(svc2.isLoaded, true);
    assert.equal(svc2.entryCount, 1);
    assert.equal(svc2.query([1, 0], 1)[0]?.entry.uuid, "u1");
  });
});

test("EmbeddingIndexService: rebuild replaces previous index", async () => {
  await withTempDir(async (dir) => {
    const svc = new EmbeddingIndexService(dir);
    await svc.rebuild(
      [{ uuid: "old", documentType: "actor" as const, name: "Old", text: "old" }],
      makeEmbedFn(2),
    );
    assert.equal(svc.entryCount, 1);
    await svc.rebuild(
      [
        { uuid: "new1", documentType: "journal" as const, name: "New 1", text: "new one" },
        { uuid: "new2", documentType: "actor" as const, name: "New 2", text: "new two" },
      ],
      makeEmbedFn(2),
    );
    assert.equal(svc.entryCount, 2);
    assert.ok(svc.query([1, 0], 5).every((r) => r.entry.uuid.startsWith("new")));
  });
});
