import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const moduleRoot = path.join(repositoryRoot, "packages", "foundry-module");
const manifestPath = path.join(moduleRoot, "module.json");
const packagePath = path.join(moduleRoot, "package.json");
const rootPackagePath = path.join(repositoryRoot, "package.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const rootPackageJson = JSON.parse(await readFile(rootPackagePath, "utf8"));

if (manifest.id !== "lorebridge") {
  throw new Error(`Unexpected Foundry module id: ${String(manifest.id)}`);
}

if (manifest.compatibility?.minimum !== "14") {
  throw new Error("LoreBridge must declare Foundry v14 as its minimum supported version.");
}

if (manifest.version !== packageJson.version || manifest.version !== rootPackageJson.version) {
  throw new Error(
    `Version mismatch: manifest=${manifest.version}, foundry package=${packageJson.version}, root package=${rootPackageJson.version}.`
  );
}

const expectedMetadata = {
  manifest: "https://github.com/Jonwh25/lorebridge/releases/latest/download/module.json",
  download: `https://github.com/Jonwh25/lorebridge/releases/download/v${manifest.version}/lorebridge.zip`,
  license: "https://github.com/Jonwh25/lorebridge/blob/main/LICENSE",
  readme: "https://github.com/Jonwh25/lorebridge/blob/main/README.md",
  bugs: "https://github.com/Jonwh25/lorebridge/issues",
  changelog: "https://github.com/Jonwh25/lorebridge/blob/main/CHANGELOG.md"
};

for (const [field, expected] of Object.entries(expectedMetadata)) {
  if (manifest[field] !== expected) {
    throw new Error(`Manifest field ${field} must be ${expected}.`);
  }
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

const bundle = await readFile(path.join(moduleRoot, "dist", "main.js"), "utf8");
if (bundle.includes("@lorebridge/shared")) {
  throw new Error("Foundry bundle contains an unresolved @lorebridge/shared import.");
}

console.log(`Verified Foundry module ${manifest.id} ${manifest.version}.`);
console.log(`Verified ${referencedFiles.length} manifest-referenced files.`);
console.log("Verified official Foundry release URLs, metadata, and browser-safe bundle.");
