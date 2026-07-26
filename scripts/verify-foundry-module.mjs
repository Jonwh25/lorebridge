import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const moduleRoot = path.join(repositoryRoot, "packages", "foundry-module");
const manifestPath = path.join(moduleRoot, "module.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.id !== "lorebridge") {
  throw new Error(`Unexpected Foundry module id: ${String(manifest.id)}`);
}

if (manifest.compatibility?.minimum !== "14") {
  throw new Error("LoreBridge must declare Foundry v14 as its minimum supported version.");
}

const referencedFiles = [
  ...(manifest.esmodules ?? []),
  ...(manifest.styles ?? [])
];

if (referencedFiles.length === 0) {
  throw new Error("The Foundry manifest does not reference any scripts or styles.");
}

for (const relativePath of referencedFiles) {
  await access(path.join(moduleRoot, relativePath));
}

console.log(`Verified Foundry module ${manifest.id} ${manifest.version}.`);
console.log(`Verified ${referencedFiles.length} manifest-referenced files.`);
