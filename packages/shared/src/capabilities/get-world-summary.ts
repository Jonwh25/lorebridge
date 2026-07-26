import type { CapabilityDeclaration, ValidationResult } from "../index.js";

export const GET_WORLD_SUMMARY_CAPABILITY = "getWorldSummary" as const;

export type GetWorldSummaryInput = Record<string, never>;

export interface GetWorldSummaryOutput {
  source: {
    sourceId: string;
    adapterType: "foundry";
  };
  world: {
    id: string;
    title: string;
    foundryVersion: string;
  };
  system: {
    id: string;
    title: string;
    version: string;
  };
  counts: {
    actors: number;
    scenes: number;
    journals: number;
    installedModules: number;
    activeModules: number;
  };
}

export const GET_WORLD_SUMMARY_DECLARATION: CapabilityDeclaration = {
  name: GET_WORLD_SUMMARY_CAPABILITY,
  mode: "read",
  version: "0.1"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && typeof value === "number" && value >= 0;

export function validateGetWorldSummaryOutput(
  value: unknown
): ValidationResult<GetWorldSummaryOutput> {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: ["world summary must be an object"] };
  }

  const source = value.source;
  const world = value.world;
  const system = value.system;
  const counts = value.counts;

  if (!isRecord(source)) {
    errors.push("source must be an object");
  } else {
    if (!isNonEmptyString(source.sourceId)) errors.push("source.sourceId is required");
    if (source.adapterType !== "foundry") errors.push("source.adapterType must be foundry");
  }

  if (!isRecord(world)) {
    errors.push("world must be an object");
  } else {
    if (!isNonEmptyString(world.id)) errors.push("world.id is required");
    if (!isNonEmptyString(world.title)) errors.push("world.title is required");
    if (!isNonEmptyString(world.foundryVersion)) errors.push("world.foundryVersion is required");
  }

  if (!isRecord(system)) {
    errors.push("system must be an object");
  } else {
    if (!isNonEmptyString(system.id)) errors.push("system.id is required");
    if (!isNonEmptyString(system.title)) errors.push("system.title is required");
    if (!isNonEmptyString(system.version)) errors.push("system.version is required");
  }

  if (!isRecord(counts)) {
    errors.push("counts must be an object");
  } else {
    for (const key of ["actors", "scenes", "journals", "installedModules", "activeModules"] as const) {
      if (!isNonNegativeInteger(counts[key])) {
        errors.push(`counts.${key} must be a non-negative integer`);
      }
    }
  }

  return errors.length === 0
    ? { valid: true, value: value as unknown as GetWorldSummaryOutput, errors }
    : { valid: false, errors };
}
