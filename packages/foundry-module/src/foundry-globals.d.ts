declare const Hooks: {
  once(hook: string, callback: (...args: unknown[]) => void): void;
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
  modules: Map<string, { active: boolean }>;
};

declare const ui: {
  notifications: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
};
