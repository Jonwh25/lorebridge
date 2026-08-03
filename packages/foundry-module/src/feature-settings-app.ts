import {
  LOREBRIDGE_SETTINGS,
  getFoundrySettingsApi,
  getLoreBridgeSettings,
} from "./settings.js";

const MODULE_ID = "lorebridge";
type AnyRecord = Record<string, unknown>;
type AppV2Instance = { render(options?: AnyRecord): Promise<unknown>; readonly element: HTMLElement };
type AppV2Static = { new (options?: AnyRecord): AppV2Instance; DEFAULT_OPTIONS: AnyRecord; PARTS?: AnyRecord };

const foundryApi = (
  globalThis as unknown as { foundry?: { applications?: { api?: AnyRecord } } }
).foundry?.applications?.api as
  | {
      ApplicationV2?: AppV2Static;
      HandlebarsApplicationMixin?: (base: AppV2Static) => AppV2Static;
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

type StagedFeatureSettings = {
  [K in keyof FeatureSettingsContext]: boolean | undefined;
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
    const staged = this._stagedFeatureValues();
    return {
      writesEnabled: staged.writesEnabled ?? settings.writesEnabled,
      uiButtonsEnabled: staged.uiButtonsEnabled ?? settings.uiButtonsEnabled,
      chatCommandEnabled: staged.chatCommandEnabled ?? settings.chatCommandEnabled,
      journalQaEnabled: staged.journalQaEnabled ?? settings.journalQaEnabled,
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
    const features = [
      [LOREBRIDGE_SETTINGS.writesEnabled, "writesEnabled"],
      [LOREBRIDGE_SETTINGS.uiButtonsEnabled, "uiButtonsEnabled"],
      [LOREBRIDGE_SETTINGS.chatCommandEnabled, "chatCommandEnabled"],
      [LOREBRIDGE_SETTINGS.journalQaEnabled, "journalQaEnabled"],
    ] as const;

    const parentForm = this._parentSettingsForm();
    if (!parentForm) {
      ui.notifications.error("LoreBridge feature settings require the parent Game Settings window to remain open.");
      return;
    }

    for (const [setting, field] of features) {
      const input = parentForm.querySelector<HTMLInputElement>(`input[name='${MODULE_ID}.${setting}']`);
      if (!input) {
        ui.notifications.error("LoreBridge could not stage feature settings in the parent Game Settings window.");
        return;
      }
      input.checked = values[field];
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    ui.notifications.info("LoreBridge feature choices staged. Click Save Changes in the parent Game Settings window to apply them.");
  }

  private _stagedFeatureValues(): StagedFeatureSettings {
    const form = this._parentSettingsForm();
    if (!form) {
      return {
        writesEnabled: undefined,
        uiButtonsEnabled: undefined,
        chatCommandEnabled: undefined,
        journalQaEnabled: undefined,
      };
    }
    const read = (setting: string): boolean | undefined =>
      form.querySelector<HTMLInputElement>(`input[name='${MODULE_ID}.${setting}']`)?.checked;
    return {
      writesEnabled: read(LOREBRIDGE_SETTINGS.writesEnabled),
      uiButtonsEnabled: read(LOREBRIDGE_SETTINGS.uiButtonsEnabled),
      chatCommandEnabled: read(LOREBRIDGE_SETTINGS.chatCommandEnabled),
      journalQaEnabled: read(LOREBRIDGE_SETTINGS.journalQaEnabled),
    };
  }

  /** Locate the SettingsConfig form that launched this registered submenu. */
  private _parentSettingsForm(): HTMLFormElement | null {
    const appParent = (this as unknown as { parent?: { element?: HTMLElement | null } }).parent;
    const parentForm = appParent?.element?.querySelector<HTMLFormElement>("form");
    if (parentForm) return parentForm;

    const settingsForm = getFoundrySettingsApi().sheet?.element?.querySelector<HTMLFormElement>("form");
    if (settingsForm) return settingsForm;

    return document.querySelector<HTMLFormElement>("#settings-config form");
  }
}
