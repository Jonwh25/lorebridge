import { openPlayerLoreAllowlistDialog } from "./capabilities/player-lore.js";

/**
 * Thin wrapper registered as the settings-menu `type` for the player lore
 * allowlist. Foundry calls `new type()` then `.render()`, so we open the
 * DialogV2 there instead of inheriting from ApplicationV2.
 * Kept in its own file to avoid a circular dependency with settings.ts.
 */
export class PlayerLoreAllowlistApp {
  static DEFAULT_OPTIONS: Record<string, unknown> = { id: "lorebridge-player-lore-allowlist" };
  readonly element: HTMLElement = document.createElement("div");

  render(_options?: unknown): void {
    openPlayerLoreAllowlistDialog();
  }

  async close(): Promise<void> { /* DialogV2 manages its own lifecycle */ }
}
