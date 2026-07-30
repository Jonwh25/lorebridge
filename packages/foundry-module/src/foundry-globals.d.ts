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

type FoundryJournalPage = {
  id: string;
  uuid: string;
  name: string;
  type: string;
  sort: number;
  text?: { content?: string; format?: number };
  src?: string;
};

type FoundryJournalEntry = {
  id: string;
  uuid: string;
  name: string;
  pages: Iterable<FoundryJournalPage> & {
    get(id: string): FoundryJournalPage | undefined;
  };
};

type FoundryJournalCollection = Iterable<FoundryJournalEntry> & {
  size: number;
  get(id: string): FoundryJournalEntry | undefined;
};

type FoundryActor = {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img?: string;
  folder?: { id: string; name: string } | null;
  system: Record<string, unknown>;
};

type FoundryActorCollection = Iterable<FoundryActor> & {
  size: number;
  get(id: string): FoundryActor | undefined;
};

type FoundryTokenDocument = {
  id: string;
  name: string;
  actorId?: string | null;
  actor?: { uuid: string } | null;
};

type FoundryNoteDocument = {
  id: string;
  label?: string;
  entryId?: string | null;
  pageId?: string | null;
  entry?: { id: string; uuid: string; name: string } | null;
  page?: { id: string; uuid: string; name: string } | null;
};

type FoundryScene = {
  id: string;
  uuid: string;
  name: string;
  active: boolean;
  navigation: boolean;
  navName?: string;
  thumb?: string;
  /** @deprecated since v14 — use firstLevel.background.src instead */
  background?: { src?: string };
  firstLevel?: { background?: { src?: string }; foreground?: { src?: string } } | null;
  width?: number;
  height?: number;
  folder?: { id: string; name: string } | null;
  journal?: { id: string; uuid: string; name: string } | null;
  journalEntryPage?: { id: string; uuid: string; name: string } | null;
  tokens: Iterable<FoundryTokenDocument> & { size: number };
  notes: Iterable<FoundryNoteDocument> & { size: number };
};

type FoundrySceneCollection = Iterable<FoundryScene> & {
  size: number;
  active: FoundryScene | null;
  get(id: string): FoundryScene | undefined;
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
  actors: FoundryActorCollection;
  scenes: FoundrySceneCollection;
  journal: FoundryJournalCollection;
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
