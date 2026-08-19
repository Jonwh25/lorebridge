import type { ListMacroToolsInput, ListMacrosInput, MacroEntry, MacroToolDefinition } from "@lorebridge/shared/capabilities";

interface MacroToolInfo extends MacroToolDefinition {
  macroId: string;
}

function extractLoreBridgeToolConfig(command: string): MacroToolDefinition | null {
  const match = command.match(/const\s+loreBridgeTool\s*=\s*/);
  if (!match || match.index === undefined) return null;

  const afterEquals = command.slice(match.index + match[0].length);

  // Count braces to find the closing brace of the object literal
  let depth = 0;
  let i = 0;
  for (; i < afterEquals.length; i++) {
    if (afterEquals[i] === "{") depth++;
    else if (afterEquals[i] === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  if (depth !== 0) return null;

  const objectSource = afterEquals.slice(0, i).trim();
  let config: unknown;
  try {
    // Safe: macros are authored by the GM and already run with full Foundry access.
    // eslint-disable-next-line no-new-func
    config = new Function(`return (${objectSource})`)();
  } catch {
    return null;
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) return null;
  const c = config as Record<string, unknown>;
  if (typeof c.name !== "string" || !c.name.trim()) return null;
  if (typeof c.description !== "string" || !c.description.trim()) return null;

  const parameters =
    typeof c.parameters === "object" && c.parameters !== null && !Array.isArray(c.parameters)
      ? (c.parameters as Record<string, unknown>)
      : { type: "object", properties: {} };

  return {
    name: c.name.trim(),
    description: c.description.trim(),
    parameters,
    macroName: "",
  };
}

function getAllMacroTools(): MacroToolInfo[] {
  const tools: MacroToolInfo[] = [];
  const seen = new Set<string>();

  for (const macro of game.macros) {
    if (macro.type !== "script") continue;
    const config = extractLoreBridgeToolConfig(macro.command);
    if (!config) continue;
    if (seen.has(config.name)) continue;
    seen.add(config.name);
    const tool: MacroToolInfo = { ...config, macroName: macro.name, macroId: macro.id };
    if (macro.folder?.id) tool.folderId = macro.folder.id;
    if (macro.folder?.name) tool.folderName = macro.folder.name;
    tools.push(tool);
  }
  return tools;
}

export function listMacros(input?: ListMacrosInput): { macros: MacroEntry[] } {
  const filterFolderId = input?.folderId;
  const macros: MacroEntry[] = [];

  for (const macro of game.macros) {
    if (macro.type !== "script") continue;
    const folderId = macro.folder?.id ?? undefined;
    const folderName = macro.folder?.name ?? undefined;
    if (filterFolderId !== undefined && folderId !== filterFolderId) continue;

    const isCallable = extractLoreBridgeToolConfig(macro.command) !== null;
    const entry: MacroEntry = { id: macro.id, name: macro.name, type: macro.type, isCallable };
    if (folderId) entry.folderId = folderId;
    if (folderName) entry.folderName = folderName;
    macros.push(entry);
  }
  return { macros };
}

export function listMacroTools(input?: ListMacroToolsInput): { tools: MacroToolDefinition[] } {
  const all = getAllMacroTools();
  const filtered = input?.folderId !== undefined
    ? all.filter((t) => t.folderId === input.folderId)
    : all;
  return {
    tools: filtered.map(({ macroId: _id, ...rest }) => rest),
  };
}

export async function executeMacroTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ macroName: string; result: string }> {
  const all = getAllMacroTools();
  const tool = all.find((t) => t.name === toolName);
  if (!tool) {
    const available = all.map((t) => t.name).join(", ") || "none";
    throw new Error(
      `No macro tool named '${toolName}' found. Available tools: ${available}`,
    );
  }

  const macro = game.macros.get(tool.macroId);
  if (!macro) {
    throw new Error(`Macro '${tool.macroName}' (id: ${tool.macroId}) no longer exists.`);
  }

  let rawResult: unknown;
  try {
    rawResult = await macro.execute({ loreBridgeArgs: args });
  } catch (error) {
    throw new Error(
      `Macro '${tool.macroName}' execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let result: string;
  if (rawResult === undefined || rawResult === null) {
    result = "Macro completed successfully with no return value.";
  } else if (typeof rawResult === "string") {
    result = rawResult;
  } else {
    try {
      result = JSON.stringify(rawResult, null, 2);
    } catch {
      result = String(rawResult);
    }
  }

  return { macroName: tool.macroName, result };
}
