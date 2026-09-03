import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { PreTagReadinessError, runPreTagReadiness } from "./pretag-readiness.mjs";

const VERSION = "1.2.3";
const temporaryRoots = [];

after(async () => {
  for (const root of temporaryRoots) {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("lorebridge-pretag-"));
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lorebridge-pretag-"));
  temporaryRoots.push(root);
  const moduleRoot = path.join(root, "packages", "foundry-module");
  await mkdir(moduleRoot, { recursive: true });
  const versions = {
    root: VERSION,
    lock: VERSION,
    lockRoot: VERSION,
    lockFoundry: VERSION,
    foundry: VERSION,
    manifest: VERSION,
    ...overrides.versions,
  };
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: versions.root }));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ version: versions.lock, packages: { "": { version: versions.lockRoot }, "packages/foundry-module": { version: versions.lockFoundry } } }));
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
  for (const key of ["root", "lock", "lockRoot", "lockFoundry", "foundry", "manifest"]) {
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
  for (const version of [undefined, "v1.2.3", "1.2", "next", "01.2.3"]) {
    await assert.rejects(
      runPreTagReadiness({ version, cwd: root, runCommand: fakeRunner().runner, write: () => {} }),
      /explicit semantic version/,
    );
  }
});

test("real local Git origin accepts current main and safely rejects dirty and stale checkouts", async () => {
  const root = await fixture();
  const remote = await fixture();
  const git = (cwd, args, allowExitCodes = []) => {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "absent-global-config") },
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && !allowExitCodes.includes(result.status)) throw new Error(result.stderr);
    return { code: result.status, stdout: result.stdout.trim() };
  };
  git(remote, ["init", "--bare"]);
  git(root, ["init", "--initial-branch=main"]);
  git(root, ["config", "user.name", "Readiness Test"]);
  git(root, ["config", "user.email", "readiness@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["-c", "commit.gpgsign=false", "commit", "-m", "Fixture release"]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["push", "origin", "main"]);
  const checkedHead = git(root, ["rev-parse", "HEAD"]).stdout;
  const output = [];
  const runCommand = (command, args, options) => command === "git"
    ? git(root, args, options.allowExitCodes)
    : { code: 0, stdout: "" }; // Expensive package gates are covered separately.
  const check = () => runPreTagReadiness({ version: VERSION, cwd: root, runCommand, write: (line) => output.push(line) });
  await check();
  assert.ok(output.some((line) => line.includes(`v${VERSION} ${checkedHead} -m`)));
  assert.equal(git(root, ["tag", "--list"]).stdout, "");

  const packagePath = path.join(root, "package.json");
  const original = await readFile(packagePath, "utf8");
  await writeFile(packagePath, `${original}\n`);
  output.length = 0;
  await assert.rejects(check(), /Tracked files/);
  assert.deepEqual(output, []);
  assert.equal(await readFile(packagePath, "utf8"), `${original}\n`);
  await writeFile(packagePath, original);

  // Advance only the local bare origin, leaving this checkout behind it.
  const next = git(root, ["-c", "user.name=Readiness Test", "-c", "user.email=readiness@example.invalid", "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "New remote release commit"]).stdout;
  git(root, ["push", "origin", `${next}:refs/heads/main`]);
  await assert.rejects(check(), /does not match origin\/main/);
  assert.deepEqual(output, []);
  assert.equal(git(root, ["rev-parse", "HEAD"]).stdout, checkedHead);
});
