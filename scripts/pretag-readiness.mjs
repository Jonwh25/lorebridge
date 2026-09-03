import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export class PreTagReadinessError extends Error {
  constructor(message) {
    super(message);
    this.name = "PreTagReadinessError";
  }
}

function defaultRun(command, args, options = {}) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      stdio: options.inheritOutput ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout: (stdout ?? "").trim() };
  } catch (error) {
    const code = typeof error.status === "number" ? error.status : 1;
    if (typeof error.status === "number" && options.allowExitCodes?.includes(code)) {
      return { code, stdout: String(error.stdout ?? "").trim() };
    }
    const detail = String(error.stderr ?? error.message ?? "command failed").trim();
    throw new PreTagReadinessError(
      `Command failed: ${command} ${args.join(" ")}\n${detail}\nResolve the command failure and rerun release:check before tagging.`,
    );
  }
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new PreTagReadinessError(
      `Could not read ${label} at ${filePath}. Restore a valid JSON file before tagging. (${error.message})`,
    );
  }
}

function assertVersion(actual, expected, label) {
  if (actual !== expected) {
    throw new PreTagReadinessError(
      `${label} version is ${String(actual)}, expected ${expected}. Synchronize every release version before tagging.`,
    );
  }
}

function checkCheckout(run, expectedHead) {
  const branch = run("git", ["branch", "--show-current"]).stdout;
  if (branch !== "main") {
    throw new PreTagReadinessError(
      `Current branch is ${branch || "detached HEAD"}, expected main. Check out main and pull the merged release commit before tagging.`,
    );
  }

  const trackedStatus = run("git", ["status", "--porcelain", "--untracked-files=no"]).stdout;
  if (trackedStatus) {
    throw new PreTagReadinessError(
      "Tracked files have staged or unstaged changes. Commit or intentionally stash them, then rerun the guard; no changes were discarded.",
    );
  }

  run("git", ["fetch", "origin"]);
  const localHead = run("git", ["rev-parse", "HEAD"]).stdout;
  const remoteHead = run("git", ["rev-parse", "refs/remotes/origin/main"]).stdout;
  if (!localHead || localHead !== remoteHead) {
    throw new PreTagReadinessError(
      "Local HEAD does not match origin/main. Run git pull --ff-only and resolve any blocking local work before tagging.",
    );
  }
  if (expectedHead && localHead !== expectedHead) {
    throw new PreTagReadinessError(
      "HEAD changed while the readiness checks were running. Rerun the guard from the intended release commit.",
    );
  }
  return localHead;
}

function checkTagAvailability(run, tag) {
  const localTag = run(
    "git",
    ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`],
    { allowExitCodes: [0, 1] },
  );
  if (localTag.code === 0) {
    throw new PreTagReadinessError(
      `Local tag ${tag} already exists. Never move or reuse a release tag; choose a new version if the tag was published.`,
    );
  }

  const remoteTag = run(
    "git",
    ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`],
    { allowExitCodes: [0, 2] },
  );
  if (remoteTag.code === 0) {
    throw new PreTagReadinessError(
      `Remote tag ${tag} already exists. Never move or reuse a published release tag; prepare a new version.`,
    );
  }
}

export async function validateReleaseFiles(root, version) {
  const rootPackage = await readJson(path.join(root, "package.json"), "root package.json");
  const lockfile = await readJson(path.join(root, "package-lock.json"), "package-lock.json");
  const foundryPackage = await readJson(
    path.join(root, "packages", "foundry-module", "package.json"),
    "Foundry package.json",
  );
  const manifest = await readJson(
    path.join(root, "packages", "foundry-module", "module.json"),
    "Foundry module.json",
  );

  assertVersion(rootPackage.version, version, "Root package.json");
  assertVersion(lockfile.version, version, "Package-lock root");
  assertVersion(lockfile.packages?.[""]?.version, version, "Package-lock workspace root");
  assertVersion(lockfile.packages?.["packages/foundry-module"]?.version, version, "Package-lock Foundry workspace");
  assertVersion(foundryPackage.version, version, "Foundry package.json");
  assertVersion(manifest.version, version, "Foundry module.json");

  const expectedDownload = `https://github.com/Jonwh25/lorebridge/releases/download/v${version}/lorebridge.zip`;
  if (manifest.download !== expectedDownload) {
    throw new PreTagReadinessError(
      `Foundry module download URL is ${String(manifest.download)}, expected ${expectedDownload}. Update module.json before tagging.`,
    );
  }

  let changelog;
  try {
    changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  } catch {
    throw new PreTagReadinessError("Cannot read CHANGELOG.md. Restore the dated release notes before tagging.");
  }
  const escapedVersion = version.replaceAll(".", "\\.");
  const heading = new RegExp(`^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
  if (!heading.test(changelog)) {
    throw new PreTagReadinessError(
      `CHANGELOG.md is missing a dated \"## [${version}] - YYYY-MM-DD\" release heading. Complete the changelog before tagging.`,
    );
  }
}

export async function runPreTagReadiness({
  version,
  cwd = process.cwd(),
  runCommand = defaultRun,
  write = console.log,
} = {}) {
  if (!VERSION_RE.test(String(version ?? ""))) {
    throw new PreTagReadinessError(
      "Pass an explicit semantic version without a v prefix, for example: npm run release:check -- 0.34.0",
    );
  }

  const run = (command, args, options = {}) => runCommand(command, args, { cwd, ...options });
  const tag = `v${version}`;
  const checkedHead = checkCheckout(run);
  checkTagAvailability(run, tag);

  await validateReleaseFiles(cwd, version);

  const npmExecPath = process.env.npm_execpath;
  const runNpm = (args) => {
    if (npmExecPath) return run(process.execPath, [npmExecPath, ...args], { inheritOutput: true });
    if (process.platform === "win32") {
      return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args], { inheritOutput: true });
    }
    return run("npm", args, { inheritOutput: true });
  };
  runNpm(["run", "validate"]);
  runNpm(["run", "package:foundry"]);
  run(process.execPath, ["scripts/verify-release-archive.mjs"], { inheritOutput: true });

  checkCheckout(run, checkedHead);
  checkTagAvailability(run, tag);

  write(`All pre-tag checks passed for LoreBridge ${version}.`);
  write("Run these owner-only commands from this unchanged checkout:");
  write(`git tag -a ${tag} ${checkedHead} -m "LoreBridge ${tag}"`);
  write(`git push origin ${tag}`);
}

async function main() {
  try {
    await runPreTagReadiness({ version: process.argv[2] });
  } catch (error) {
    console.error(`Pre-tag readiness failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
