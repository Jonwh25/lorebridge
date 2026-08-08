import { openPlayerLoreAllowlistDialog } from "./capabilities/player-lore.js";

// ---------------------------------------------------------------------------
// ApplicationV2 base — same stub pattern used across this module
// ---------------------------------------------------------------------------

type FoundryApplicationV2 = {
  new (options?: Record<string, unknown>): {
    readonly element: HTMLElement;
    rendered: boolean;
    bringToFront(): void;
    render(opts?: unknown): Promise<unknown>;
    close(opts?: unknown): Promise<unknown>;
  };
  DEFAULT_OPTIONS: Record<string, unknown>;
};

const _StubBase: FoundryApplicationV2 = class {
  static DEFAULT_OPTIONS = {};
  readonly element: HTMLElement = document.createElement("div");
  rendered = false;
  bringToFront(): void { return; }
  async render(_opts?: unknown): Promise<this> { return this; }
  async close(_opts?: unknown): Promise<this> { return this; }
} as unknown as FoundryApplicationV2;

const _AppV2Base: FoundryApplicationV2 = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: { ApplicationV2?: FoundryApplicationV2 } } };
  }
).foundry?.applications?.api?.ApplicationV2 ?? _StubBase;

// ---------------------------------------------------------------------------
// Thin wrapper — Foundry calls new type().render(); we open the DialogV2 there
// ---------------------------------------------------------------------------

export class PlayerLoreAllowlistApp extends (_AppV2Base as unknown as new () => InstanceType<FoundryApplicationV2>) {
  static DEFAULT_OPTIONS: Record<string, unknown> = { id: "lorebridge-player-lore-allowlist" };

  override async render(_opts?: unknown): Promise<this> {
    openPlayerLoreAllowlistDialog();
    return this;
  }

  override async close(_opts?: unknown): Promise<this> {
    return this;
  }
}
