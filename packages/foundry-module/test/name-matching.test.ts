import assert from "node:assert/strict";
import test from "node:test";

import { normalizeName, matchName } from "../src/utils/name-matching.js";

test("normalizeName lowercases and strips punctuation", () => {
  assert.equal(normalizeName("Sir Aldric"), "aldric");
  assert.equal(normalizeName("Lady Voss"), "voss");
  assert.equal(normalizeName("Baron Harwick"), "harwick");
  assert.equal(normalizeName("The Mad King"), "king");
  assert.equal(normalizeName("Ghost of Elara"), "elara");
  assert.equal(normalizeName("Spirit of the Forest"), "forest");
});

test("normalizeName strips multiple leading titles", () => {
  assert.equal(normalizeName("Sir Lord Aldric"), "aldric");
  assert.equal(normalizeName("The Mad King Gregor"), "gregor");
});

test("normalizeName replaces hyphens with spaces and strips other punctuation", () => {
  assert.equal(normalizeName("Brother Dorin-Vale"), "dorin vale");
  assert.equal(normalizeName("Queen Mira's"), "miras");
});

test("normalizeName leaves non-title names alone", () => {
  assert.equal(normalizeName("Strahd von Zarovich"), "strahd von zarovich");
  assert.equal(normalizeName("Alexei"), "alexei");
});

test("matchName returns exact match at score 100", () => {
  const result = matchName("Sir Aldric", ["Aldric", "Godfrey"]);
  assert.equal(result, "Aldric");
});

test("matchName returns null when no target meets threshold", () => {
  const result = matchName("Xyzzy", ["Aldric", "Godfrey", "Elara"]);
  assert.equal(result, null);
});

test("matchName matches when candidate starts with normalized target", () => {
  const result = matchName("Godfrey Gwilym the Bold", ["Godfrey Gwilym", "Aldric"]);
  assert.equal(result, "Godfrey Gwilym");
});

test("matchName matches when target starts with candidate", () => {
  const result = matchName("Strahd", ["Strahd von Zarovich", "Ireena Kolyana"]);
  assert.equal(result, "Strahd von Zarovich");
});

test("matchName matches when candidate contains target", () => {
  const result = matchName("The Elara Chronicles mention Elara often", ["Elara"]);
  assert.equal(result, "Elara");
});

test("matchName picks best score when multiple candidates match", () => {
  const result = matchName("Aldric", ["Aldric the Bold", "Aldric"]);
  assert.equal(result, "Aldric");
});

test("matchName returns null below threshold", () => {
  const result = matchName("Aldric", ["Godfrey"], 100);
  assert.equal(result, null);
});

test("matchName word-set match at score 50", () => {
  const result = matchName("lord godfrey gwilym was seen", ["Godfrey Gwilym"]);
  assert.equal(result, "Godfrey Gwilym");
});

test("matchName first+last word match at score 40 when threshold allows", () => {
  // 3-word target; candidate has first ("aldric") and last ("harwick") but not middle ("von")
  const result = matchName("i saw aldric talking to harwick", ["Aldric von Harwick"], 40);
  assert.equal(result, "Aldric von Harwick");
});

test("matchName first+last word match excluded at default threshold", () => {
  const result = matchName("i saw aldric talking to harwick", ["Aldric von Harwick"]);
  assert.equal(result, null);
});
