import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmbeddingItem, EmbeddingDocumentType } from "@lorebridge/shared/capabilities";

const SNIPPET_CHARS = 200;
const INDEX_VERSION = 1;

export interface IndexEntry {
  uuid: string;
  documentType: EmbeddingDocumentType;
  name: string;
  excerpt: string;
  contentHash?: string;
  embedding: number[];
}

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

interface IndexFile {
  version: number;
  entries: IndexEntry[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class EmbeddingIndexService {
  private readonly indexPath: string;
  private entries: IndexEntry[] | null = null;

  constructor(dataDir: string) {
    this.indexPath = path.join(dataDir, "semantic-index.json");
  }

  get isLoaded(): boolean {
    return this.entries !== null;
  }

  get entryCount(): number {
    return this.entries?.length ?? 0;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.indexPath, "utf8");
      const parsed = JSON.parse(raw) as IndexFile;
      if (parsed.version !== INDEX_VERSION || !Array.isArray(parsed.entries)) {
        this.entries = [];
        return;
      }
      this.entries = parsed.entries.filter(
        (e) =>
          typeof e.uuid === "string" &&
          (e.documentType === "journal" || e.documentType === "actor") &&
          typeof e.name === "string" &&
          typeof e.excerpt === "string" &&
          Array.isArray(e.embedding),
      );
    } catch {
      this.entries = [];
    }
  }

  private async save(): Promise<void> {
    const file: IndexFile = { version: INDEX_VERSION, entries: this.entries ?? [] };
    const json = JSON.stringify(file);
    const tmp = this.indexPath + ".tmp";
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    await writeFile(tmp, json, "utf8");
    await rename(tmp, this.indexPath);
  }

  async rebuild(
    items: EmbeddingItem[],
    embedFn: (texts: string[]) => Promise<number[][]>,
    batchSize = 50,
    incremental = false,
  ): Promise<void> {
    if (incremental && this.entries !== null) {
      await this.#rebuildIncremental(items, embedFn, batchSize);
      return;
    }

    const total = items.length;
    const totalBatches = Math.ceil(total / batchSize);
    console.log(`[lorebridge] Semantic index rebuild starting: ${total} items in ${totalBatches} batches`);
    const newEntries: IndexEntry[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = items.slice(i, i + batchSize);
      const texts = batch.map((item) => item.text || item.name);
      console.log(`[lorebridge] Embedding batch ${batchNum}/${totalBatches} (items ${i + 1}–${Math.min(i + batchSize, total)}/${total})`);
      const embeddings = await embedFn(texts);
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]!;
        const embedding = embeddings[j];
        if (!embedding) continue;
        newEntries.push({
          uuid: item.uuid,
          documentType: item.documentType,
          name: item.name,
          excerpt: (item.text || item.name).slice(0, SNIPPET_CHARS),
          contentHash: hashContent(item.text || item.name),
          embedding,
        });
      }
    }
    this.entries = newEntries;
    await this.save();
  }

  async #rebuildIncremental(
    items: EmbeddingItem[],
    embedFn: (texts: string[]) => Promise<number[][]>,
    batchSize: number,
  ): Promise<void> {
    const existingMap = new Map<string, IndexEntry>();
    for (const entry of this.entries!) {
      existingMap.set(entry.uuid, entry);
    }

    const inputUuids = new Set(items.map((i) => i.uuid));
    const removed = (this.entries!).filter((e) => !inputUuids.has(e.uuid)).length;

    const toEmbed: Array<{ item: EmbeddingItem; hash: string }> = [];
    const kept: IndexEntry[] = [];

    for (const item of items) {
      const hash = hashContent(item.text || item.name);
      const existing = existingMap.get(item.uuid);
      if (existing?.contentHash === hash) {
        kept.push(existing);
      } else {
        toEmbed.push({ item, hash });
      }
    }

    console.log(
      `[lorebridge] Incremental index update: ${toEmbed.length} to embed, ${kept.length} unchanged, ${removed} removed`,
    );

    const newEntries: IndexEntry[] = [...kept];

    if (toEmbed.length > 0) {
      const total = toEmbed.length;
      const totalBatches = Math.ceil(total / batchSize);
      for (let i = 0; i < toEmbed.length; i += batchSize) {
        const batchNum = Math.floor(i / batchSize) + 1;
        const batch = toEmbed.slice(i, i + batchSize);
        const texts = batch.map((x) => x.item.text || x.item.name);
        console.log(`[lorebridge] Embedding batch ${batchNum}/${totalBatches} (items ${i + 1}–${Math.min(i + batchSize, total)}/${total})`);
        const embeddings = await embedFn(texts);
        for (let j = 0; j < batch.length; j++) {
          const { item, hash } = batch[j]!;
          const embedding = embeddings[j];
          if (!embedding) continue;
          newEntries.push({
            uuid: item.uuid,
            documentType: item.documentType,
            name: item.name,
            excerpt: (item.text || item.name).slice(0, SNIPPET_CHARS),
            contentHash: hash,
            embedding,
          });
        }
      }
    }

    this.entries = newEntries;
    await this.save();
  }

  query(
    queryEmbedding: number[],
    limit: number,
    types?: EmbeddingDocumentType[],
  ): Array<{ entry: IndexEntry; score: number }> {
    if (!this.entries || this.entries.length === 0) return [];
    const candidates = types
      ? this.entries.filter((e) => types.includes(e.documentType))
      : this.entries;
    return candidates
      .map((entry) => ({ entry, score: cosineSimilarity(queryEmbedding, entry.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
