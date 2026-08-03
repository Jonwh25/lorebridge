import { LoreBridgeBackendClient } from "./backend-client.js";
import {
  LOREBRIDGE_SETTINGS,
  getFoundrySettingsApi,
  getLoreBridgeSettings,
} from "./settings.js";

const MODULE_ID = "lorebridge";

// ---------------------------------------------------------------------------
// Minimal type shims for the Foundry V2 Application API (runtime types only)
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

type AppV2Instance = {
  render(options?: AnyRecord): Promise<unknown>;
  close(options?: AnyRecord): Promise<unknown>;
  readonly element: HTMLElement;
};

type AppV2Static = {
  new (options?: AnyRecord): AppV2Instance;
  DEFAULT_OPTIONS: AnyRecord;
  PARTS?: AnyRecord;
};

type DialogV2Static = {
  prompt(config: AnyRecord): Promise<unknown>;
  confirm(config: AnyRecord): Promise<boolean>;
};

// Access globalThis.foundry.applications safely so that unit-test environments
// that lack the full Foundry runtime don't throw at import time.
const foundryApi = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: AnyRecord } };
  }
).foundry?.applications?.api as
  | {
      ApplicationV2?: AppV2Static;
      HandlebarsApplicationMixin?: (base: AppV2Static) => AppV2Static;
      DialogV2?: DialogV2Static;
    }
  | undefined;

// ---------------------------------------------------------------------------
// Test-safe base class — used when the real Foundry runtime is absent
// ---------------------------------------------------------------------------

const TestSafeBase: AppV2Static = class implements AppV2Instance {
  static DEFAULT_OPTIONS: AnyRecord = {};
  static PARTS: AnyRecord = {};
  readonly element: HTMLElement = document.createElement("div");
  async render(_options?: AnyRecord): Promise<unknown> { return undefined; }
  async close(_options?: AnyRecord): Promise<unknown> { return undefined; }
};

// ---------------------------------------------------------------------------
// Build the real base class (HandlebarsApplicationMixin + ApplicationV2) when
// the runtime is available, otherwise fall back to the test-safe stub.
// ---------------------------------------------------------------------------

const ApplicationV2 = foundryApi?.ApplicationV2 ?? TestSafeBase;
const HandlebarsApplicationMixin = foundryApi?.HandlebarsApplicationMixin;
const AppBase: AppV2Static = HandlebarsApplicationMixin
  ? HandlebarsApplicationMixin(ApplicationV2)
  : ApplicationV2;

// ---------------------------------------------------------------------------
// Configuration application
// ---------------------------------------------------------------------------

interface ConfigurationContext {
  backendUrl: string;
  connectionStatus: string;
  backendId: string;
  fingerprint: string;
  paired: boolean;
}

export class LoreBridgeConfigurationApp extends AppBase {
  static override DEFAULT_OPTIONS: AnyRecord = {
    id: "lorebridge-configuration",
    window: { title: "Configure LoreBridge" },
    position: { width: 560, height: "auto" },
    actions: {
      check: LoreBridgeConfigurationApp._onCheck,
      pair: LoreBridgeConfigurationApp._onPair,
      unpair: LoreBridgeConfigurationApp._onUnpair,
      saveUrl: LoreBridgeConfigurationApp._onSaveUrl,
    },
  };

  static override PARTS: AnyRecord = {
    form: { template: "modules/lorebridge/templates/configuration.hbs" },
  };

  // Held so the form handler (a static function without `this`) can reach the
  // most recently rendered instance. This is safe because only one config app
  // is ever open at a time.
  private static _lastInstance: LoreBridgeConfigurationApp | null = null;

  constructor(options?: AnyRecord) {
    super(options);
    LoreBridgeConfigurationApp._lastInstance = this;
  }

  // V2 equivalent of getData()
  async _prepareContext(_options?: AnyRecord): Promise<ConfigurationContext> {
    const settings = getLoreBridgeSettings();
    const ctx: ConfigurationContext = {
      backendUrl: settings.backendUrl,
      connectionStatus: settings.backendUrl ? "Not checked" : "Not configured",
      backendId: "",
      fingerprint: "",
      paired: false,
    };

    if (!settings.backendUrl) return ctx;

    try {
      const client = new LoreBridgeBackendClient(settings.backendUrl, settings.clientToken);
      const [health, identity] = await Promise.all([client.health(), client.identity()]);
      ctx.connectionStatus = `Connected — backend ${health.version}`;
      ctx.backendId = identity.id;
      ctx.fingerprint = identity.fingerprint;
      if (settings.clientToken) {
        ctx.paired = (await client.pairingStatus()).paired;
      }
    } catch (error) {
      ctx.connectionStatus = error instanceof Error ? error.message : "Connection failed";
    }

    return ctx;
  }

  // V2 equivalent of activateListeners() — called after every render
  _onRender(_context: ConfigurationContext, _options?: AnyRecord): void {
    // V2 wires data-action buttons automatically via the `actions` map above.
    // No manual listener attachment is needed here.
  }

  // ---------------------------------------------------------------------------
  // Action handlers (static so V2 can call them with `this` = app instance)
  // ---------------------------------------------------------------------------

  static async _onCheck(
    this: LoreBridgeConfigurationApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    try {
      const url = await this._saveBackendUrlFromForm();
      const client = new LoreBridgeBackendClient(url, this._clientToken());
      const health = await client.health();
      const identity = await client.identity();
      ui.notifications.info(`LoreBridge backend ${health.version} connected (${identity.id}).`);
      await this.render();
    } catch (error) {
      LoreBridgeConfigurationApp._notifyError(error);
    }
  }

  static async _onPair(
    this: LoreBridgeConfigurationApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    try {
      const url = await this._saveBackendUrlFromForm();
      const client = new LoreBridgeBackendClient(url);
      const attempt = await client.startPairing();
      const code = await LoreBridgeConfigurationApp._promptForCode(
        attempt.code,
        attempt.expiresAt,
      );
      if (!code) return;

      const result = await client.completePairing(code, `Foundry ${game.version ?? "v14"}`);
      await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, result.token);
      ui.notifications.info(`LoreBridge paired with ${result.backendId}.`);
      await this.render();
    } catch (error) {
      LoreBridgeConfigurationApp._notifyError(error);
    }
  }

  static async _onUnpair(
    this: LoreBridgeConfigurationApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, "");
    ui.notifications.info("LoreBridge pairing removed from this browser.");
    await this.render();
  }

  static async _onSaveUrl(
    this: LoreBridgeConfigurationApp,
    _event: PointerEvent,
    _target: HTMLElement,
  ): Promise<void> {
    try {
      await this._saveBackendUrlFromForm();
      console.info("lorebridge | Backend URL saved.");
      await this.render();
    } catch (error) {
      LoreBridgeConfigurationApp._notifyError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async _saveBackendUrlFromForm(): Promise<string> {
    const input = this.element?.querySelector<HTMLInputElement>("input[name='backendUrl']");
    const url = input?.value.trim() ?? getLoreBridgeSettings().backendUrl;
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, url);
    return url;
  }

  private _clientToken(): string {
    return String(
      getFoundrySettingsApi().get(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken) ?? "",
    );
  }

  private static async _promptForCode(
    suggestedCode: string,
    expiresAt: string,
  ): Promise<string | undefined> {
    const DialogV2 = foundryApi?.DialogV2;
    if (!DialogV2) throw new Error("Foundry DialogV2 API is unavailable.");

    let resolvedCode: string | undefined;
    await DialogV2.prompt({
      window: { title: "Pair LoreBridge" },
      content: `
        <p>The backend created pairing code <strong>${suggestedCode}</strong>.</p>
        <p>Confirm the code before ${new Date(expiresAt).toLocaleTimeString()}.</p>
        <div class="form-group">
          <label>Pairing Code</label>
          <input type="text" name="pairingCode" value="${suggestedCode}" autocomplete="one-time-code">
        </div>`,
      ok: {
        icon: "fas fa-link",
        label: "Pair",
        callback: (_event: Event, button: HTMLButtonElement) => {
          const input = button.form?.querySelector<HTMLInputElement>("input[name='pairingCode']");
          resolvedCode = input?.value.trim();
        },
      },
      rejectClose: false,
    });

    return resolvedCode;
  }

  private static _notifyError(error: unknown): void {
    const message = error instanceof Error ? error.message : "LoreBridge operation failed.";
    ui.notifications.error(message);
  }
}

