import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PreTagReadinessError, runPreTagReadiness } from "./pretag-readiness.mjs";

const VERSION = "1.2.3";

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lorebridge-pretag-"));
  const moduleRoot = path.join(root, "packages", "foundry-module");
  await mkdir(moduleRoot, { recursive: true });
  const versions = {
    root: VERSION,
    lock: VERSION,
    lockRoot: VERSION,
    foundry: VERSION,
    manifest: VERSION,
    ...overrides.versions,
  };
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: versions.root }));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ version: versions.lock, packages: { "": { version: versions.lockRoot } } }));
  await writeFile(path.join(moduleRoot, "package.json"), JSON.stringify({ version: versions.foundry }));
  await writeFile(path.join(moduleRoot, "module.json"), JSON.stringify({
    version: versions.manifest,
    download: overrides.download ?? `https://github.com/Jonwh25/lorebridge/releases/download/v${VERSION}/lorebridge.zip`,
  }));
  await writeFile(path.join(root, "CHANGELOG.md"), overrides.changelog ?? `# Changelog\n\n## [${VERSION}] - 2026-09-02\n`);
  return root;
}

function fakeRunner(state = {}) {
  const calls = [];
  let statusChecks = 0;
  let headChecks = 0;
  let remoteHeadChecks = 0;
  const runner = (command, args) => {
    calls.push([command, ...args]);
    const joined = args.join(" ");
    if (joined === "branch --show-current") return { code: 0, stdout: state.branch ?? "main" };
    if (joined === "status --porcelain --untracked-files=no") {
      statusChecks += 1;
      return { code: 0, stdout: statusChecks > 1 ? (state.statusAfter ?? state.status ?? "") : (state.status ?? "") };
    }
    if (joined === "rev-parse HEAD") {
      headChecks += 1;
      return { code: 0, stdout: headChecks > 1 ? (state.localHeadAfter ?? state.localHead ?? "abc123") : (state.localHead ?? "abc123") };
    }
    if (joined === "rev-parse refs/remotes/origin/main") {
      remoteHeadChecks += 1;
      return { code: 0, stdout: remoteHeadChecks > 1 ? (state.remoteHeadAfter ?? state.remoteHead ?? "abc123") : (state.remoteHead ?? "abc123") };
    }
    if (joined.startsWith("rev-parse --verify --quiet refs/tags/")) return { code: state.localTag ? 0 : 1, stdout: "" };
    if (joined.startsWith("ls-remote --exit-code --tags origin refs/tags/")) return { code: state.remoteTag ? 0 : 2, stdout: "" };
    if (joined === "scripts/verify-release-archive.mjs" && state.invalidArchive) {
      throw new PreTagReadinessError("Command failed: release archive is invalid");
    }
    return { code: 0, stdout: "" };
  };
  return { calls, runner };
}

async function run(root, state = {}) {
  const output = [];
  const fake = fakeRunner(state);
  await runPreTagReadiness({ version: VERSION, cwd: root, runCommand: fake.runner, write: (line) => output.push(line) });
  return { ...fake, output };
}

test("passes all gates and prints exact tag commands only at the end", async () => {
  const root = await fixture();
  const { calls, output } = await run(root);
  assert.deepEqual(output.slice(-2), [
    `git tag -a v${VERSION} abc123 -m "LoreBridge v${VERSION}"`,
    `git push origin v${VERSION}`,
  ]);
  assert.ok(calls.some((call) => call.join(" ").endsWith("run validate")));
  assert.ok(calls.some((call) => call.join(" ").endsWith("run package:foundry")));
  assert.ok(calls.some((call) => call.at(-1) === "scripts/verify-release-archive.mjs"));
  assert.equal(calls.some((call) => ["reset", "tag", "push"].includes(call[1])), false);
});

for (const scenario of [
  { name: "wrong branch", state: { branch: "release" }, message: /expected main/ },
  { name: "dirty tracked files", state: { status: " M package-lock.json" }, message: /Tracked files/ },
  { name: "stale HEAD", state: { remoteHead: "def456" }, message: /does not match origin\/main/ },
  { name: "existing local tag", state: { localTag: true }, message: /Local tag.*already exists/ },
  { name: "existing remote tag", state: { remoteTag: true }, message: /Remote tag.*already exists/ },
  { name: "invalid archive", state: { invalidArchive: true }, message: /archive is invalid/ },
]) {
  test(`fails safely for ${scenario.name} without printing tag commands`, async () => {
    const root = await fixture();
    const output = [];
    const fake = fakeRunner(scenario.state);
    await assert.rejects(
      runPreTagReadiness({ version: VERSION, cwd: root, runCommand: fake.runner, write: (line) => output.push(line) }),
      scenario.message,
    );
    assert.deepEqual(output, []);
    assert.equal(fake.calls.some((call) => ["reset", "tag", "push"].includes(call[1])), false);
  });
}

test("rejects every synchronized version source independently", async () => {
  for (const key of ["root", "lock", "lockRoot", "foundry", "manifest"]) {
    const root = await fixture({ versions: { [key]: "9.9.9" } });
    const fake = fakeRunner();
    await assert.rejects(
      runPreTagReadiness({ version: VERSION, cwd: root, runCommand: fake.runner, write: () => {} }),
      /version is 9\.9\.9, expected 1\.2\.3/,
    );
  }
});

test("rejects a wrong download URL and missing changelog heading", async () => {
  const wrongDownload = await fixture({ download: "https://example.test/lorebridge.zip" });
  await assert.rejects(run(wrongDownload), /download URL/);

  const missingChangelog = await fixture({ changelog: "# Changelog\n\n## Unreleased\n" });
  await assert.rejects(run(missingChangelog), /missing a dated/);
});

test("rechecks the checkout after validation before printing tag commands", async () => {
  const dirtyRoot = await fixture();
  await assert.rejects(run(dirtyRoot, { statusAfter: " M package.json" }), /Tracked files/);

  const movedRoot = await fixture();
  await assert.rejects(run(movedRoot, { localHeadAfter: "def456", remoteHeadAfter: "def456" }), /HEAD changed/);
});

test("requires an explicit unprefixed semantic version", async () => {
  const root = await fixture();
  for (const version of [undefined, "v1.2.3", "1.2", "next"]) {
    await assert.rejects(
      runPreTagReadiness({ version, cwd: root, runCommand: fakeRunner().runner, write: () => {} }),
      /explicit semantic version/,
    );
  }
});
