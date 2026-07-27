declare const Hooks: {
  once(hook: string, callback: (...args: unknown[]) => void): void;
};

type FoundrySettingConfig = {
  name: string;
  hint?: string;
  scope: "world" | "client";
  config: boolean;
  type: BooleanConstructor | StringConstructor;
  default: boolean | string;
  choices?: Record<string, string>;
  requiresReload?: boolean;
};

declare const game: {
  version: string;
  user: {
    isGM: boolean;
    name: string;
  } | null;
  world: {
    id: string;
    title: string;
  } | null;
  system: {
    id: string;
    title: string;
    version: string;
  };
  actors: { size: number };
  scenes: { size: number };
  journal: { size: number };
  modules: Map<string, { active: boolean; version?: string }>;
  settings: {
    register(moduleId: string, key: string, config: FoundrySettingConfig): void;
    get(moduleId: string, key: string): unknown;
  };
};

declare const ui: {
  notifications: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
};
