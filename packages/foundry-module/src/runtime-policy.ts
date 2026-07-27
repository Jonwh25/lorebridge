import type { LoreBridgeSettings } from "./settings.js";

export function shouldExposeCapabilityApi(
  isGM: boolean,
  settings: LoreBridgeSettings
): boolean {
  return isGM && settings.capabilityApiEnabled;
}
