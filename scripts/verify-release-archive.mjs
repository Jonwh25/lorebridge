import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const zipPath = path.join(process.cwd(), "release", "lorebridge.zip");
const data = readFileSync(zipPath, "binary");

const required = [
  "module.json",
  "dist/main.js",
  "styles/lorebridge.css",
  "templates/context-profiles.hbs",
];
const missing = required.filter((f) => !data.includes(f));

if (missing.length > 0) {
  console.error(`Missing from release archive: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Verified release archive contains: ${required.join(", ")}`);
