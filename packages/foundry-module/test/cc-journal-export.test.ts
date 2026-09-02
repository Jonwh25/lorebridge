import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const names = ["game", "foundry", "ui"] as const;
const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
let runExport: typeof import("../src/capabilities/cc-journal-export.js").runExportCCJournals;
let resultHtml = "";
let errors: string[] = [];

before(async () => {
  class Application {
    static DEFAULT_OPTIONS = {};
    rendered = false;
    async render() { return this; }
    async close() { return this; }
  }
  class Dialog {
    constructor(private options: { window: { title: string }; content: string; buttons: { action: string; callback?: (event: unknown, button: unknown) => void }[] }) {}
    render() {
      if (this.options.window.title === "Campaign Codex Export") resultHtml = this.options.content;
      else this.options.buttons.find((button) => button.action === "export")?.callback?.(null, {
        closest: () => ({ querySelectorAll: () => [{ dataset: { folderId: "npcs" } }] }),
      });
    }
  }
  Object.defineProperty(globalThis, "foundry", { configurable: true, value: { applications: { api: { ApplicationV2: Application, DialogV2: Dialog } } } });
  ({ runExportCCJournals: runExport } = await import("../src/capabilities/cc-journal-export.js"));
});

after(() => names.forEach((name, index) => {
  const descriptor = originals[index];
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}));

function install(count: number, isGM = true) {
  resultHtml = "";
  errors = [];
  const folder = { id: "npcs", name: "Campaign Codex - NPCs", type: "JournalEntry" };
  Object.defineProperty(globalThis, "game", { configurable: true, value: {
    user: { isGM }, folders: { contents: [folder] },
    journal: Array.from({ length: count }, (_, index) => ({ id: String(index), name: `NPC ${index}`, folder, pages: [] })),
    settings: { get(_module: string, key: string) {
      return ({ backendUrl: "https://backend.invalid", clientToken: "paired-token", backupPathCcNpcs: "custom/npcs" } as Record<string, string>)[key];
    } },
  } });
  Object.defineProperty(globalThis, "ui", { configurable: true, value: { notifications: {
    info() {}, warn() {}, error(message: string) { errors.push(message); },
  } } });
}

test("aggregates chunk counts, preserves the last real commit link, and reports folder totals", async (t) => {
  install(26);
  let chunks = 0;
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    if (String(input).includes("list-paths")) return Response.json({ paths: [] });
    return Response.json(++chunks === 1
      ? { committed: 1, skipped: 24, commitUrl: "https://github.com/owner/repo/commit/actual" }
      : { committed: 0, skipped: 1 });
  });
  await runExport();
  assert.deepEqual(errors, []);
  assert.equal(chunks, 2);
  assert.match(resultHtml, /1 committed, 25 unchanged/);
  assert.match(resultHtml, /Campaign Codex - NPCs/);
  assert.match(resultHtml, /commit\/actual/);
});

test("unchanged export shows zero committed and no commit link", async (t) => {
  install(1);
  t.mock.method(globalThis, "fetch", async (input: unknown) => Response.json(String(input).includes("list-paths")
    ? { paths: [] } : { committed: 0, skipped: 1 }));
  await runExport();
  assert.deepEqual(errors, []);
  assert.match(resultHtml, /0 committed, 1 unchanged/);
  assert.doesNotMatch(resultHtml, /View last commit/);
});

test("an empty selected folder can still remove its stale files", async (t) => {
  install(0);
  let deletions: unknown;
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    if (String(input).includes("list-paths")) return Response.json({ paths: ["custom/npcs/old.md", "unselected/keep.md"] });
    deletions = JSON.parse(String(init?.body));
    return Response.json({ committed: 0, skipped: 0, commitUrl: "https://github.com/owner/repo/commit/deletion" });
  });
  await runExport();
  assert.deepEqual(errors, []);
  assert.deepEqual((deletions as { deletePaths: string[] }).deletePaths, ["custom/npcs/old.md"]);
  assert.match(resultHtml, /1 deleted file removed/);
});

test("older backend responses still count written files", async (t) => {
  install(1);
  t.mock.method(globalThis, "fetch", async (input: unknown) => Response.json(String(input).includes("list-paths")
    ? { paths: [] } : { commitUrl: "https://github.com/owner/repo/commit/old" }));
  await runExport();
  assert.deepEqual(errors, []);
  assert.match(resultHtml, /1 committed, 0 unchanged/);
});

test("non-GM export is rejected before contacting the backend", async (t) => {
  install(1, false);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network"); });
  await assert.rejects(runExport(), /GM/);
  assert.equal(fetchMock.mock.callCount(), 0);
});
