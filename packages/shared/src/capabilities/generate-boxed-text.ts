import type { ValidationResult } from "../index.js";

export type BoxedTextTone = "gothic" | "neutral" | "heroic" | "mysterious";
export type BoxedTextLength = "short" | "medium" | "long";
export type BoxedTextAudience = "players" | "gm";
export type BoxedTextDocumentType = "journalPage" | "scene";

export interface GenerateBoxedTextInput {
  content: string;
  documentName: string;
  documentType: BoxedTextDocumentType;
  sourceId: string;
  sourceName: string;
  tone?: BoxedTextTone;
  length?: BoxedTextLength;
  audience?: BoxedTextAudience;
}

export interface BoxedTextSource {
  name: string;
}

export interface GenerateBoxedTextOutput {
  preview: string;
  sources: BoxedTextSource[];
  provider: string;
  tone: BoxedTextTone;
  length: BoxedTextLength;
}

const CONTENT_MAX = 4000;
const TONES: BoxedTextTone[] = ["gothic", "neutral", "heroic", "mysterious"];
const LENGTHS: BoxedTextLength[] = ["short", "medium", "long"];
const AUDIENCES: BoxedTextAudience[] = ["players", "gm"];
const DOCUMENT_TYPES: BoxedTextDocumentType[] = ["journalPage", "scene"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export function validateGenerateBoxedTextInput(value: unknown): ValidationResult<GenerateBoxedTextInput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };

  if (!isNonEmptyString(value.content)) errors.push("content must be a non-empty string");
  else if ((value.content as string).trim().length > CONTENT_MAX) errors.push(`content must not exceed ${CONTENT_MAX} characters`);

  if (!isNonEmptyString(value.documentName)) errors.push("documentName must be a non-empty string");
  if (!DOCUMENT_TYPES.includes(value.documentType as BoxedTextDocumentType)) errors.push("documentType must be journalPage or scene");
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId must be a non-empty string");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName must be a non-empty string");

  if (value.tone !== undefined && !TONES.includes(value.tone as BoxedTextTone)) errors.push("tone must be gothic, neutral, heroic, or mysterious");
  if (value.length !== undefined && !LENGTHS.includes(value.length as BoxedTextLength)) errors.push("length must be short, medium, or long");
  if (value.audience !== undefined && !AUDIENCES.includes(value.audience as BoxedTextAudience)) errors.push("audience must be players or gm");

  if (errors.length > 0) return { valid: false, errors };

  const result: GenerateBoxedTextInput = {
    content: (value.content as string).trim(),
    documentName: (value.documentName as string).trim(),
    documentType: value.documentType as BoxedTextDocumentType,
    sourceId: (value.sourceId as string).trim(),
    sourceName: (value.sourceName as string).trim(),
    ...(value.tone !== undefined ? { tone: value.tone as BoxedTextTone } : {}),
    ...(value.length !== undefined ? { length: value.length as BoxedTextLength } : {}),
    ...(value.audience !== undefined ? { audience: value.audience as BoxedTextAudience } : {}),
  };
  return { valid: true, errors: [], value: result };
}

export function validateGenerateBoxedTextOutput(value: unknown): ValidationResult<GenerateBoxedTextOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };

  if (!isNonEmptyString(value.preview)) errors.push("preview must be a non-empty string");
  if (!Array.isArray(value.sources)) errors.push("sources must be an array");
  if (!isNonEmptyString(value.provider)) errors.push("provider must be a non-empty string");
  if (!TONES.includes(value.tone as BoxedTextTone)) errors.push("tone must be a valid BoxedTextTone");
  if (!LENGTHS.includes(value.length as BoxedTextLength)) errors.push("length must be a valid BoxedTextLength");

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    value: {
      preview: (value.preview as string).trim(),
      sources: (value.sources as Array<Record<string, unknown>>).map(s => ({ name: String(s.name ?? "") })),
      provider: value.provider as string,
      tone: value.tone as BoxedTextTone,
      length: value.length as BoxedTextLength,
    },
  };
}
