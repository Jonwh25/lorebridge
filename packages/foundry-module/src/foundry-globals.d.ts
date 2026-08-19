declare const Hooks: {
  once(hook: string, callback: (...args: unknown[]) => void): void;
  on(hook: string, callback: (...args: unknown[]) => unknown): number;
  off(hook: string, id: number | ((...args: unknown[]) => unknown)): void;
};

declare const CONFIG: Record<string, unknown>;
declare function fromUuidSync(uuid: string): unknown;
declare function fromUuid(uuid: string): Promise<unknown>;

type FoundrySettingConfig = {
  name: string;
  hint?: string;
  scope: "world" | "client";
  config: boolean;
  type: BooleanConstructor | StringConstructor | NumberConstructor;
  default: boolean | string | number;
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
  folder?: { id: string; name: string } | null;
  ownership?: Record<string, number>;
  pages: Iterable<FoundryJournalPage> & {
    get(id: string): FoundryJournalPage | undefined;
  };
  sheet?: { render(force: boolean): void };
  createEmbeddedDocuments(
    type: string,
    data: Record<string, unknown>[],
  ): Promise<FoundryJournalPage[]>;
};

type FoundryJournalCollection = Iterable<FoundryJournalEntry> & {
  size: number;
  get(id: string): FoundryJournalEntry | undefined;
  search(search: { query?: string; exclude?: string[] }): FoundryJournalEntry[] | object[];
};

type FoundryItem = {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img?: string;
  folder?: { id: string; name: string } | null;
  system: Record<string, unknown>;
  ownership?: Record<string, number>;
};

type FoundryItemCollection = Iterable<FoundryItem> & {
  size: number;
  get(id: string): FoundryItem | undefined;
  search(search: { query?: string; exclude?: string[] }): FoundryItem[] | object[];
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
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  update(data: Record<string, unknown>): Promise<FoundryActor>;
  createEmbeddedDocuments(type: "Item", data: Record<string, unknown>[]): Promise<FoundryItem[]>;
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
  getDocument(id: string): Promise<{ toObject(): Record<string, unknown> } | null | undefined>;
  getIndex(options?: { fields?: string[] }): Promise<unknown>;
  search(search: { query?: string; exclude?: string[] }): FoundryCompendiumIndexEntry[] | object[];
};

type FoundryCompendiumCollection = Iterable<FoundryCompendiumPack> & {
  size: number;
  get(id: string): FoundryCompendiumPack | undefined;
};

type FoundryMacro = {
  id: string;
  name: string;
  type: string;
  command: string;
  folder?: { id: string; name: string } | null;
  execute(scope?: Record<string, unknown>): Promise<unknown>;
};

type FoundryMacroCollection = Iterable<FoundryMacro> & {
  size: number;
  get(id: string): FoundryMacro | undefined;
};

type FoundryActorCollection = Iterable<FoundryActor> & {
  size: number;
  get(id: string): FoundryActor | undefined;
  search(search: { query?: string; exclude?: string[] }): FoundryActor[] | object[];
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
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
};

type FoundryFolderDocument = {
  id: string;
  name: string;
  type: string;
  sort?: number;
  folder?: { id: string } | null;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
};

type FoundryFolderCollection = Iterable<FoundryFolderDocument> & {
  size: number;
  get(id: string): FoundryFolderDocument | undefined;
};

type FoundrySceneCollection = Iterable<FoundryScene> & {
  size: number;
  active: FoundryScene | null;
  get(id: string): FoundryScene | undefined;
  search(search: { query?: string; exclude?: string[] }): FoundryScene[] | object[];
};

type FoundryCombatant = {
  id: string;
  name: string;
  initiative?: number | null;
  tokenId?: string | null;
  hidden: boolean;
  isDefeated: boolean;
  actor?: FoundryActor | null;
};

type FoundryCombat = {
  id: string;
  uuid: string;
  name: string;
  scene?: { id: string } | null;
  active: boolean;
  started: boolean;
  current: { round?: number; turn?: number };
  combatant: FoundryCombatant | null;
  turns: FoundryCombatant[];
  nextTurn(): Promise<FoundryCombat>;
  setInitiative(id: string, value: number): Promise<void>;
  endCombat(): Promise<FoundryCombat>;
};

type FoundryCombatCollection = Iterable<FoundryCombat> & {
  active: FoundryCombat | null;
};

type FoundryUser = {
  id: string;
  name: string;
  isGM: boolean;
};

declare class FoundryApplicationV2 {
  constructor(options?: Record<string, unknown>);
  static DEFAULT_OPTIONS: Partial<{
    id: string;
    classes: string[];
    window: { title?: string; resizable?: boolean };
    position: { width?: number | string; height?: number | string };
  }>;
  readonly rendered: boolean;
  readonly element: HTMLElement;
  render(options?: boolean | { force?: boolean }): Promise<this>;
  close(options?: { force?: boolean }): Promise<this>;
  bringToFront(): void;
  _renderHTML(context: Record<string, unknown>, options: unknown): Promise<HTMLElement>;
  _replaceHTML(result: HTMLElement, content: HTMLElement, options: unknown): void;
  _onClickAction(event: PointerEvent, target: HTMLElement): void | Promise<void>;
}

declare const foundry: {
  utils: {
    randomID(length?: number): string;
  };
  applications: {
    api: {
      ApplicationV2: typeof FoundryApplicationV2;
      DialogV2: {
        new(config: {
          classes?: string[];
          window?: { title?: string; resizable?: boolean };
          position?: { width?: number; height?: string | number; zIndex?: number };
          content: string;
          buttons: Array<{
            action: string;
            label: string;
            icon?: string;
            default?: boolean;
            callback?: (event: Event, button: HTMLElement, dialog: unknown) => void;
          }>;
        }): { element: HTMLElement; render(options: { force: boolean }): Promise<unknown> };
      };
    };
    apps: {
      FilePicker: {
        implementation: FoundryFilePickerImpl;
      };
    };
  };
};

type FoundryRollTableResult = {
  id: string;
  type: number; // 0=text, 1=document, 2=pack
  description: string; // renamed from text in Foundry v13
  img?: string;
  weight: number;
  range: [number, number];
  drawn: boolean;
};

type FoundryRollTable = {
  id: string;
  uuid: string;
  name: string;
  formula: string;
  replacement: boolean;
  displayRoll: boolean;
  img?: string;
  folder?: { id: string; name: string } | null;
  results: Iterable<FoundryRollTableResult> & { size: number };
};

type FoundryRollTableCollection = Iterable<FoundryRollTable> & {
  size: number;
  get(id: string): FoundryRollTable | undefined;
};

declare const Actor: {
  create(data: Record<string, unknown>): Promise<FoundryActor | undefined>;
};

declare const Scene: {
  create(data: Record<string, unknown>): Promise<FoundryScene | undefined>;
};

declare const Folder: {
  create(data: Record<string, unknown>): Promise<FoundryFolderDocument | undefined>;
};

declare const RollTable: {
  create(data: {
    name: string;
    formula?: string;
    results: Array<{
      type: "text" | "document" | "pack";
      text: string;
      weight: number;
      range: [number, number];
    }>;
  }): Promise<{ id: string; name: string } | undefined>;
};

declare const JournalEntry: {
  create(data: {
    name: string;
    ownership?: Record<string, number>;
  }): Promise<FoundryJournalEntry | undefined>;
};

declare const ChatMessage: {
  create(data: {
    content: string;
    whisper?: string[];
    speaker?: { alias?: string };
    flags?: Record<string, unknown>;
  }): Promise<{ id: string } | undefined>;
};

type FoundryDieResult = { result: number; active?: boolean };
type FoundryDieTerm = { faces: number; results: FoundryDieResult[] };
type FoundryChatMessage = { id: string; author?: { name?: string }; speaker?: { alias?: string }; content: string; type: string | number; timestamp: number; whisper: string[]; blind?: boolean; rolls?: Array<{ formula?: string; total?: number; result?: string }> };
type FoundryChatCollection = Iterable<FoundryChatMessage> & { size: number };

declare const Roll: {
  new(formula: string): {
    formula: string;
    result: string;
    total: number | null;
    dice: FoundryDieTerm[];
    evaluate(options?: { allowInteractive?: boolean }): Promise<unknown>;
    toMessage(messageData?: { speaker?: { alias?: string }; flavor?: string }, options?: { create?: boolean; messageMode?: string }): Promise<{ id: string } | undefined>;
  };
  validate(formula: string): boolean;
};
declare const FilePicker: {
  browse(source: "data", target: string, options?: { extensions?: string[]; wildcard?: boolean }): Promise<{ files?: string[]; dirs?: string[] }>;
  upload(source: "data", path: string, file: File, options?: Record<string, unknown>): Promise<{ path?: string } | false>;
};

type FoundryFilePickerImpl = {
  browse(source: "data", target: string, options?: { extensions?: string[]; wildcard?: boolean }): Promise<{ files?: string[]; dirs?: string[] }>;
  upload(source: "data", path: string, file: File, options?: Record<string, unknown>): Promise<{ path?: string } | false>;
  createDirectory(source: "data", path: string, options?: Record<string, unknown>): Promise<unknown>;
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
  macros: FoundryMacroCollection;
  actors: FoundryActorCollection;
  items: FoundryItemCollection;
  scenes: FoundrySceneCollection;
  folders: FoundryFolderCollection;
  combats: FoundryCombatCollection;
  messages: FoundryChatCollection;
  journal: FoundryJournalCollection;
  tables: FoundryRollTableCollection;
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

declare const TextEditor: {
  enrichHTML(
    content: string,
    options?: { secrets?: boolean; async?: boolean; [key: string]: unknown }
  ): Promise<string>;
};
