declare const Hooks: {
  once(hook: string, callback: (...args: unknown[]) => void): void;
  on(hook: string, callback: (...args: unknown[]) => void): void;
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
  ownership?: Record<string, number>;
  update(data: Record<string, unknown>): Promise<FoundryJournalPage>;
};

type FoundryJournalEntry = {
  id: string;
  uuid: string;
  name: string;
  ownership?: Record<string, number>;
  pages: Iterable<FoundryJournalPage> & {
    get(id: string): FoundryJournalPage | undefined;
  };
};

type FoundryJournalCollection = Iterable<FoundryJournalEntry> & {
  size: number;
  get(id: string): FoundryJournalEntry | undefined;
};

type FoundryItem = {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
  ownership?: Record<string, number>;
};

type FoundryItemCollection = Iterable<FoundryItem> & {
  size: number;
  get(id: string): FoundryItem | undefined;
};

type FoundryActor = {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img?: string;
  folder?: { id: string; name: string } | null;
  system: Record<string, unknown>;
  ownership?: Record<string, number>;
  items: FoundryItemCollection;
};

type FoundryCompendiumIndexEntry = {
  _id: string;
  name: string;
  img?: string;
  type?: string;
  sort?: number;
};

type FoundryCompendiumPack = {
  metadata: {
    id: string;
    label: string;
    type: string;
    packageName?: string;
    packageType?: string;
  };
  index: Iterable<FoundryCompendiumIndexEntry> & {
    size: number;
    get(id: string): FoundryCompendiumIndexEntry | undefined;
  };
};

type FoundryCompendiumCollection = Iterable<FoundryCompendiumPack> & {
  size: number;
  get(id: string): FoundryCompendiumPack | undefined;
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
  ownership?: Record<string, number>;
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

type FoundryUser = {
  id: string;
  name: string;
  isGM: boolean;
};

declare const foundry: {
  applications: {
    api: {
      DialogV2: {
        new(config: {
          window?: { title?: string; resizable?: boolean };
          content: string;
          buttons: Array<{
            action: string;
            label: string;
            icon?: string;
            default?: boolean;
            callback?: (event: Event, button: HTMLElement, dialog: unknown) => void;
          }>;
        }): { render(options: { force: boolean }): void };
      };
    };
  };
};

declare const ChatMessage: {
  create(data: {
    content: string;
    whisper?: string[];
    speaker?: { alias?: string };
    flags?: Record<string, unknown>;
  }): Promise<{ id: string } | undefined>;
};

declare const game: {
  version: string;
  userId: string | null;
  user: {
    isGM: boolean;
    name: string;
    id: string;
  } | null;
  users: Iterable<FoundryUser> & {
    filter(fn: (u: FoundryUser) => boolean): FoundryUser[];
  };
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
  items: FoundryItemCollection;
  scenes: FoundrySceneCollection;
  journal: FoundryJournalCollection;
  packs: FoundryCompendiumCollection;
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
