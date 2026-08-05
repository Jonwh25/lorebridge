import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const root = process.cwd();
const moduleRoot = path.join(root, "packages", "foundry-module");
const releaseRoot = path.join(root, "release");
const stagingRoot = path.join(releaseRoot, "lorebridge");
const manifestPath = path.join(moduleRoot, "module.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

await rm(releaseRoot, { recursive: true, force: true });

await mkdir(path.join(stagingRoot, "dist"), { recursive: true });
await mkdir(path.join(stagingRoot, "styles"), { recursive: true });
await mkdir(path.join(stagingRoot, "templates"), { recursive: true });

await cp(manifestPath, path.join(stagingRoot, "module.json"));
await cp(path.join(moduleRoot, "dist", "main.js"), path.join(stagingRoot, "dist", "main.js"));
await cp(path.join(moduleRoot, "styles", "lorebridge.css"), path.join(stagingRoot, "styles", "lorebridge.css"));
await cp(path.join(moduleRoot, "templates", "configuration.hbs"), path.join(stagingRoot, "templates", "configuration.hbs"));
await cp(path.join(moduleRoot, "templates", "feature-settings.hbs"), path.join(stagingRoot, "templates", "feature-settings.hbs"));
await cp(manifestPath, path.join(releaseRoot, "module.json"));

await new Promise((resolve, reject) => {
  const output = createWriteStream(path.join(releaseRoot, "lorebridge.zip"));
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(stagingRoot, false);
  archive.finalize();
});

console.log(`Packaged LoreBridge ${manifest.version}.`);
console.log(path.join(releaseRoot, "module.json"));
console.log(path.join(releaseRoot, "lorebridge.zip"));
