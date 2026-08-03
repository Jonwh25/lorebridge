import {
  LOREBRIDGE_SETTINGS,
  getFoundrySettingsApi,
  getLoreBridgeSettings,
} from "./settings.js";

const MODULE_ID = "lorebridge";
type AnyRecord = Record<string, unknown>;
type AppV2Instance = { render(options?: AnyRecord): Promise<unknown>; readonly element: HTMLElement };
type AppV2Static = { new (options?: AnyRecord): AppV2Instance; DEFAULT_OPTIONS: AnyRecord; PARTS?: AnyRecord };
type DialogV2Static = {
  new (config: {
    window?: { title?: string; resizable?: boolean };
    content: string;
    buttons: Array<{
      action: string;
      label: string;
      icon?: string;
      default?: boolean;
      callback?: () => void;
    }>;
  }): { render(options: { force: boolean }): unknown };
};

const foundryApi = (
  globalThis as unknown as { foundry?: { applications?: { api?: AnyRecord } } }
).foundry?.applications?.api as
  | {
      ApplicationV2?: AppV2Static;
      HandlebarsApplicationMixin?: (base: AppV2Static) => AppV2Static;
      DialogV2?: DialogV2Static;
    }
  | undefined;

const TestSafeBase: AppV2Static = class implements AppV2Instance {
  static DEFAULT_OPTIONS: AnyRecord = {};
  static PARTS: AnyRecord = {};
  readonly element: HTMLElement = document.createElement("div");
  async render(_options?: AnyRecord): Promise<unknown> { return undefined; }
};

const ApplicationV2 = foundryApi?.ApplicationV2 ?? TestSafeBase;
const AppBase: AppV2Static = foundryApi?.HandlebarsApplicationMixin
  ? foundryApi.HandlebarsApplicationMixin(ApplicationV2)
  : ApplicationV2;

type FeatureSettingsContext = {
  writesEnabled: boolean;
  uiButtonsEnabled: boolean;
  chatCommandEnabled: boolean;
  journalQaEnabled: boolean;
};

/** GM-only world configuration for LoreBridge feature categories. */
export class LoreBridgeFeatureSettingsApp extends AppBase {
  static override DEFAULT_OPTIONS: AnyRecord = {
    id: "lorebridge-feature-settings",
    window: { title: "Configure LoreBridge Features" },
    position: { width: 560, height: "auto" },
    actions: {
      save: LoreBridgeFeatureSettingsApp._onSave,
    },
  };

  static override PARTS: AnyRecord = {
    form: { template: "modules/lorebridge/templates/feature-settings.hbs" },
  };

  private static _lastInstance: LoreBridgeFeatureSettingsApp | null = null;

  constructor(options?: AnyRecord) {
    super(options);
    LoreBridgeFeatureSettingsApp._lastInstance = this;
  }

  async _prepareContext(_options?: AnyRecord): Promise<FeatureSettingsContext> {
    const settings = getLoreBridgeSettings();
    return {
      writesEnabled: settings.writesEnabled,
      uiButtonsEnabled: settings.uiButtonsEnabled,
      chatCommandEnabled: settings.chatCommandEnabled,
      journalQaEnabled: settings.journalQaEnabled,
    };
  }

  static async _onSave(
    this: LoreBridgeFeatureSettingsApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    await this._saveFeatures();
  }

  private async _saveFeatures(): Promise<void> {
    const form = this.element.querySelector<HTMLFormElement>("form");
    const checked = (name: string): boolean =>
      form?.querySelector<HTMLInputElement>(`input[name='${name}']`)?.checked ?? false;
    const values = {
      writesEnabled: checked("writesEnabled"),
      uiButtonsEnabled: checked("uiButtonsEnabled"),
      chatCommandEnabled: checked("chatCommandEnabled"),
      journalQaEnabled: checked("journalQaEnabled"),
    };
    const previous = getLoreBridgeSettings();
    const features = [
      [LOREBRIDGE_SETTINGS.writesEnabled, "writesEnabled"],
      [LOREBRIDGE_SETTINGS.uiButtonsEnabled, "uiButtonsEnabled"],
      [LOREBRIDGE_SETTINGS.chatCommandEnabled, "chatCommandEnabled"],
      [LOREBRIDGE_SETTINGS.journalQaEnabled, "journalQaEnabled"],
    ] as const;

    await Promise.all(features.map(([setting, field]) =>
      getFoundrySettingsApi().set(MODULE_ID, setting, values[field]),
    ));

    document.querySelectorAll<HTMLElement>("[data-lb-feature-category]").forEach((element) => {
      const category = element.dataset["lbFeatureCategory"];
      if ((category === "ui-buttons" && !values.uiButtonsEnabled)
        || (category === "journal-qa" && !values.journalQaEnabled)) element.remove();
    });

    ui.notifications.info("LoreBridge feature settings saved.");
    await this.render();

    const changed = previous.writesEnabled !== values.writesEnabled
      || previous.uiButtonsEnabled !== values.uiButtonsEnabled
      || previous.chatCommandEnabled !== values.chatCommandEnabled
      || previous.journalQaEnabled !== values.journalQaEnabled;
    if (!changed) return;

    this._showReloadPrompt();
  }

  private _showReloadPrompt(): void {
    const DialogV2 = foundryApi?.DialogV2;
    if (!DialogV2) return;

    new DialogV2({
      window: { title: "Reload World Now?", resizable: false },
      content: "<p>LoreBridge feature settings were saved. Reload now to refresh every currently open sheet, or choose Later to keep working with the new settings applied to future interactions.</p>",
      buttons: [
        { action: "later", label: "Later", icon: "fas fa-clock", default: true },
        {
          action: "reload",
          label: "Reload Now",
          icon: "fas fa-sync",
          callback: () => window.location.reload(),
        },
      ],
    }).render({ force: true });
  }
}
