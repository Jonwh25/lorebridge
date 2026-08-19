import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const LIST_MACRO_TOOLS_CAPABILITY = "listMacroTools" as const;
export const EXECUTE_MACRO_TOOL_CAPABILITY = "executeMacroTool" as const;
export const LIST_MACROS_CAPABILITY = "listMacros" as const;

export interface MacroToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  macroName: string;
  folderId?: string;
  folderName?: string;
}

export interface ListMacroToolsInput {
  folderId?: string;
}

export interface MacroEntry {
  id: string;
  name: string;
  type: string;
  folderId?: string;
  folderName?: string;
  isCallable: boolean;
}

export interface ListMacrosInput {
  folderId?: string;
}

export interface ListMacrosOutput {
  sourceId: string;
  sourceName: string;
  macros: MacroEntry[];
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

export const LIST_MACROS_DECLARATION: CapabilityDeclaration = {
  name: LIST_MACROS_CAPABILITY,
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

export function validateListMacroToolsInput(value: unknown): ValidationResult<ListMacroToolsInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (value.folderId !== undefined && !isNonEmptyString(value.folderId)) {
    return { valid: false, errors: ["folderId must be a non-empty string"] };
  }
  return { valid: true, value: value as unknown as ListMacroToolsInput, errors: [] };
}

export function validateListMacrosInput(value: unknown): ValidationResult<ListMacrosInput> {
  if (!isRecord(value)) return { valid: false, errors: ["input must be an object"] };
  if (value.folderId !== undefined && !isNonEmptyString(value.folderId)) {
    return { valid: false, errors: ["folderId must be a non-empty string"] };
  }
  return { valid: true, value: value as unknown as ListMacrosInput, errors: [] };
}

export function validateListMacrosOutput(value: unknown): ValidationResult<ListMacrosOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!Array.isArray(value.macros)) {
    errors.push("macros must be an array");
  } else {
    value.macros.forEach((macro, i) => {
      if (!isRecord(macro)) { errors.push(`macros[${i}] must be an object`); return; }
      if (!isNonEmptyString(macro.id)) errors.push(`macros[${i}].id is required`);
      if (!isNonEmptyString(macro.name)) errors.push(`macros[${i}].name is required`);
      if (typeof macro.isCallable !== "boolean") errors.push(`macros[${i}].isCallable must be a boolean`);
    });
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as ListMacrosOutput, errors: [] };
}

export function validateListMacroToolsOutput(value: unknown): ValidationResult<ListMacroToolsOutput> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["output must be an object"] };
  if (!isNonEmptyString(value.sourceId)) errors.push("sourceId is required");
  if (!isNonEmptyString(value.sourceName)) errors.push("sourceName is required");
  if (!Array.isArray(value.tools)) {
    errors.push("tools must be an array");
  } else {
    value.tools.forEach((tool, index) => {
      if (!isRecord(tool)) { errors.push(`tools[${index}] must be an object`); return; }
      if (tool.folderId !== undefined && typeof tool.folderId !== "string") errors.push(`tools[${index}].folderId must be a string`);
      if (tool.folderName !== undefined && typeof tool.folderName !== "string") errors.push(`tools[${index}].folderName must be a string`);
    });
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as ListMacroToolsOutput, errors: [] };
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
