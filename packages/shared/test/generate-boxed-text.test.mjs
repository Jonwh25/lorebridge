import assert from "node:assert/strict";
import test from "node:test";
import {
  validateGenerateBoxedTextInput,
  validateGenerateBoxedTextOutput,
} from "../dist/capabilities.js";

const validInput = {
  content: "The Tser Falls plunge into mist-shrouded pools below.",
  documentName: "Tser Falls",
  documentType: "journalPage",
  sourceId: "foundry:cos",
  sourceName: "Curse of Strahd",
};

test("validates a minimal generate boxed text input", () => {
  const result = validateGenerateBoxedTextInput(validInput);
  assert.equal(result.valid, true);
  assert.equal(result.value?.documentName, "Tser Falls");
  assert.equal(result.value?.documentType, "journalPage");
  assert.equal(result.value?.tone, undefined);
  assert.equal(result.value?.length, undefined);
});

test("validates generate boxed text input with all optional fields", () => {
  const result = validateGenerateBoxedTextInput({ ...validInput, tone: "gothic", length: "medium", audience: "players" });
  assert.equal(result.valid, true);
  assert.equal(result.value?.tone, "gothic");
  assert.equal(result.value?.length, "medium");
  assert.equal(result.value?.audience, "players");
});

test("rejects input with invalid tone", () => {
  const result = validateGenerateBoxedTextInput({ ...validInput, tone: "scary" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("tone")));
});

test("rejects input with invalid length", () => {
  const result = validateGenerateBoxedTextInput({ ...validInput, length: "huge" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("length")));
});

test("rejects input with content exceeding 4000 characters", () => {
  const result = validateGenerateBoxedTextInput({ ...validInput, content: "x".repeat(4001) });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("4000")));
});

test("rejects input with empty content", () => {
  const result = validateGenerateBoxedTextInput({ ...validInput, content: "" });
  assert.equal(result.valid, false);
});

test("rejects input with invalid documentType", () => {
  const result = validateGenerateBoxedTextInput({ ...validInput, documentType: "item" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("documentType")));
});

test("validates a generate boxed text output", () => {
  const result = validateGenerateBoxedTextOutput({
    preview: "The falls thunder into darkness, their mist clinging like a burial shroud.",
    sources: [{ name: "Tser Falls" }],
    provider: "anthropic",
    tone: "gothic",
    length: "short",
  });
  assert.equal(result.valid, true);
  assert.equal(result.value?.provider, "anthropic");
  assert.equal(result.value?.sources[0]?.name, "Tser Falls");
});

test("rejects output missing preview", () => {
  const result = validateGenerateBoxedTextOutput({
    sources: [],
    provider: "anthropic",
    tone: "gothic",
    length: "short",
  });
  assert.equal(result.valid, false);
});
