import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BackupFile, BackupResult } from "./github-adapter.js";

export type LoreFilesResult = {
  commit?: BackupResult;
  files: string[];
  committed: number;
  skipped: number;
};

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Single-backend-process cache. All adapter writes share this queue. */
export class LoreFileHashCache {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly filename: string;

  constructor(dataDir: string) {
    this.filename = path.join(dataDir, "cc-export-hashes.json");
  }

  run(
    destination: readonly string[],
    files: BackupFile[],
    deletePaths: string[],
    skipUnchanged: boolean,
    commit: (changed: BackupFile[]) => Promise<BackupResult>,
  ): Promise<LoreFilesResult> {
    const task = this.pending.then(async () => {
      const hashes = await this.load();
      // Hash the destination and full repository path as well as the content;
      // the disk cache contains neither credentials nor campaign text/names.
      const key = (filePath: string): string => sha256(JSON.stringify([...destination, filePath]));
      const changed = files.filter((file) => !skipUnchanged || hashes.get(key(file.path)) !== sha256(file.content));
      const result = { files: changed.map((file) => file.path), committed: changed.length, skipped: files.length - changed.length };
      if (changed.length === 0 && deletePaths.length === 0) return result;

      // Persist invalidation BEFORE GitHub changes. A crash, uncertain response,
      // or failed post-commit save can then only cause a redundant future write.
      for (const file of changed) hashes.delete(key(file.path));
      for (const filePath of deletePaths) hashes.delete(key(filePath));
      await this.save(hashes);
      const committed = await commit(changed);
      for (const file of changed) hashes.set(key(file.path), sha256(file.content));
      // Deletion wins, matching the adapter's Git tree entry order.
      for (const filePath of deletePaths) hashes.delete(key(filePath));
      try {
        await this.save(hashes);
      } catch {
        // The commit succeeded and the disk cache is already safely invalidated.
        console.warn("LoreBridge: export committed, but hash cache could not be saved; the next export may rewrite files.");
      }
      return { ...result, commit: committed };
    });
    this.pending = task.catch(() => undefined);
    return task;
  }

  private async load(): Promise<Map<string, string>> {
    try {
      const data: unknown = JSON.parse(await readFile(this.filename, "utf8"));
      if (typeof data !== "object" || data === null || Array.isArray(data)) return new Map();
      const record = data as Record<string, unknown>;
      if (record.version !== 1 || typeof record.hashes !== "object" || record.hashes === null || Array.isArray(record.hashes)) return new Map();
      const entries = Object.entries(record.hashes);
      if (!entries.every(([key, value]) => isHash(key) && isHash(value))) return new Map();
      return new Map(entries as [string, string][]);
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw error;
    }
  }

  private async save(hashes: Map<string, string>): Promise<void> {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, hashes: Object.fromEntries(hashes) }), { mode: 0o600 });
      await rename(temporary, this.filename);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
