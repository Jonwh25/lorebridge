import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const moduleRoot = path.join(root, "packages", "foundry-module");
const releaseRoot = path.join(root, "release");
const stagingRoot = path.join(releaseRoot, "lorebridge");
const manifestPath = path.join(moduleRoot, "module.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

await rm(releaseRoot, { recursive: true, force: true });

await mkdir(path.join(stagingRoot, "dist"), { recursive: true });
await mkdir(path.join(stagingRoot, "styles"), { recursive: true });

await cp(manifestPath, path.join(stagingRoot, "module.json"));

await cp(
  path.join(moduleRoot, "dist", "main.js"),
  path.join(stagingRoot, "dist", "main.js")
);

await cp(
  path.join(moduleRoot, "styles", "lorebridge.css"),
  path.join(stagingRoot, "styles", "lorebridge.css")
);

await cp(manifestPath, path.join(releaseRoot, "module.json"));

execFileSync("zip", ["-qr", "../lorebridge.zip", "."], {
  cwd: stagingRoot,
  stdio: "inherit"
});

console.log(`Packaged LoreBridge ${manifest.version}.`);
console.log(path.join(releaseRoot, "module.json"));
console.log(path.join(releaseRoot, "lorebridge.zip"));
