import assert from "node:assert/strict";
import test from "node:test";
import { validateSearchAssetsInput, validateSearchAssetsOutput } from "../dist/capabilities.js";
test("validates bounded asset search contracts", () => { assert.equal(validateSearchAssetsInput({ query: "dragon", type: "image", folder: "worlds/test" }).valid, true); assert.equal(validateSearchAssetsInput({ query: "x", folder: "../private" }).valid, false); assert.equal(validateSearchAssetsOutput({ sourceId: "foundry:x", sourceName: "World", query: "dragon", results: [{ path: "worlds/test/dragon.webp", name: "dragon.webp", type: "image" }] }).valid, true); });
