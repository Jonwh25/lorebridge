import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const LIST_MACRO_TOOLS_CAPABILITY = "listMacroTools" as const;
export const EXECUTE_MACRO_TOOL_CAPABILITY = "executeMacroTool" as const;

export interface MacroToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  macroName: string;
}

export interface ListMacroToolsOutput {
  sourceId: string;
  sourceName: string;
  tools: MacroToolDefinition[];
}

export interface ExecuteMacroToolInput {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ExecuteMacroToolOutput {
  sourceId: string;
  sourceName: string;
  toolName: string;
  macroName: string;
  result: string;
}

export const LIST_MACRO_TOOLS_DECLARATION: CapabilityDeclaration = {
  name: LIST_MACRO_TOOLS_CAPABILITY,
  mode: "read",
  version: "0.1",
};

export const EXECUTE_MACRO_TOOL_DECLARATION: CapabilityDeclaration = {
  name: EXECUTE_MACRO_TOOL_CAPABILITY,
  mode: "write",
  version: "0.1",
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export function validateListMacroToolsOutput(value: unknown): ValidationResult<ListMacroToolsOutput> {
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) return { valid: false, errors: ["sourceId is required"] };
  if (!isNonEmptyString(value.sourceName)) return { valid: false, errors: ["sourceName is required"] };
  if (!Array.isArray(value.tools)) return { valid: false, errors: ["tools must be an array"] };
  return { valid: true, value: value as unknown as ListMacroToolsOutput, errors: [] };
}

export function validateExecuteMacroToolInput(value: unknown): ValidationResult<ExecuteMacroToolInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (!isNonEmptyString(value.toolName)) return { valid: false, errors: ["toolName is required"] };
  if (value.args !== undefined && !isRecord(value.args)) return { valid: false, errors: ["args must be an object"] };
  return {
    valid: true,
    value: { toolName: (value.toolName as string).trim(), args: (value.args ?? {}) as Record<string, unknown> },
    errors: [],
  };
}

export function validateExecuteMacroToolOutput(value: unknown): ValidationResult<ExecuteMacroToolOutput> {
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) return { valid: false, errors: ["sourceId is required"] };
  if (!isNonEmptyString(value.sourceName)) return { valid: false, errors: ["sourceName is required"] };
  if (!isNonEmptyString(value.toolName)) return { valid: false, errors: ["toolName is required"] };
  if (!isNonEmptyString(value.macroName)) return { valid: false, errors: ["macroName is required"] };
  if (typeof value.result !== "string") return { valid: false, errors: ["result must be a string"] };
  return { valid: true, value: value as unknown as ExecuteMacroToolOutput, errors: [] };
}
