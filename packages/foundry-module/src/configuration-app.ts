import { LoreBridgeBackendClient } from "./backend-client.js";
import {
  LOREBRIDGE_SETTINGS,
  getFoundrySettingsApi,
  getLoreBridgeSettings,
} from "./settings.js";

const MODULE_ID = "lorebridge";

type JQueryLike = {
  find(selector: string): {
    on(event: string, callback: () => void): void;
    val(): unknown;
  };
};

type FormApplicationInstance = {
  element?: { 0?: HTMLElement };
  activateListeners(html: JQueryLike): void;
  render(force?: boolean): Promise<unknown> | unknown;
};

type FormApplicationConstructor = {
  new (...args: unknown[]): FormApplicationInstance;
  defaultOptions: Record<string, unknown>;
};

type DialogConstructor = new (config: {
  title: string;
  content: string;
  buttons: Record<
    string,
    {
      icon: string;
      label: string;
      callback: (html: JQueryLike) => void;
    }
  >;
  default: string;
  close: () => void;
}) => { render(force?: boolean): unknown };

const foundryUi = globalThis as unknown as {
  FormApplication?: FormApplicationConstructor;
  Dialog?: DialogConstructor;
};

const TestSafeFormApplication = class implements FormApplicationInstance {
  static defaultOptions: Record<string, unknown> = {};
  element?: { 0?: HTMLElement };

  activateListeners(_html: JQueryLike): void {}

  render(_force?: boolean): unknown {
    return undefined;
  }
};

const FormApplicationBase: FormApplicationConstructor =
  foundryUi.FormApplication ?? TestSafeFormApplication;

interface ConfigurationData {
  backendUrl: string;
  connectionStatus: string;
  backendId: string;
  fingerprint: string;
  paired: boolean;
}

export class LoreBridgeConfigurationApp extends FormApplicationBase {
  static get defaultOptions(): Record<string, unknown> {
    return {
      ...FormApplicationBase.defaultOptions,
      id: "lorebridge-configuration",
      title: "Configure LoreBridge",
      template: "modules/lorebridge/templates/configuration.hbs",
      width: 560,
      height: "auto",
      closeOnSubmit: false,
    };
  }

  async getData(): Promise<ConfigurationData> {
    const settings = getLoreBridgeSettings();
    const data: ConfigurationData = {
      backendUrl: settings.backendUrl,
      connectionStatus: settings.backendUrl ? "Not checked" : "Not configured",
      backendId: "",
      fingerprint: "",
      paired: false,
    };

    if (!settings.backendUrl) return data;

    try {
      const client = new LoreBridgeBackendClient(settings.backendUrl, settings.clientToken);
      const [health, identity] = await Promise.all([client.health(), client.identity()]);
      data.connectionStatus = `Connected — backend ${health.version}`;
      data.backendId = identity.id;
      data.fingerprint = identity.fingerprint;
      if (settings.clientToken) {
        data.paired = (await client.pairingStatus()).paired;
      }
    } catch (error) {
      data.connectionStatus = error instanceof Error ? error.message : "Connection failed";
    }

    return data;
  }

  activateListeners(html: JQueryLike): void {
    super.activateListeners(html);
    html.find("[data-action='check']").on("click", () => void this.checkConnection());
    html.find("[data-action='pair']").on("click", () => void this.pair());
    html.find("[data-action='unpair']").on("click", () => void this.unpair());
  }

  protected async _updateObject(_event: Event, formData: Record<string, unknown>): Promise<void> {
    const backendUrl = String(formData.backendUrl ?? "").trim();
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, backendUrl);
    ui.notifications.info("LoreBridge backend URL saved.");
    await this.render(false);
  }

  private async checkConnection(): Promise<void> {
    try {
      const url = await this.saveBackendUrlFromForm();
      const client = new LoreBridgeBackendClient(url, this.clientToken());
      const health = await client.health();
      const identity = await client.identity();
      ui.notifications.info(`LoreBridge backend ${health.version} connected (${identity.id}).`);
      await this.render(false);
    } catch (error) {
      this.notifyError(error);
    }
  }

  private async pair(): Promise<void> {
    try {
      const url = await this.saveBackendUrlFromForm();
      const client = new LoreBridgeBackendClient(url);
      const attempt = await client.startPairing();
      const code = await this.promptForCode(attempt.code, attempt.expiresAt);
      if (!code) return;

      const result = await client.completePairing(code, `Foundry ${game.version ?? "v14"}`);
      await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, result.token);
      ui.notifications.info(`LoreBridge paired with ${result.backendId}.`);
      await this.render(false);
    } catch (error) {
      this.notifyError(error);
    }
  }

  private async unpair(): Promise<void> {
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, "");
    ui.notifications.info("LoreBridge pairing removed from this browser.");
    await this.render(false);
  }

  private async saveBackendUrlFromForm(): Promise<string> {
    const element = this.element?.[0];
    const input = element?.querySelector<HTMLInputElement>("input[name='backendUrl']");
    const url = input?.value.trim() ?? getLoreBridgeSettings().backendUrl;
    await getFoundrySettingsApi().set(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, url);
    return url;
  }

  private clientToken(): string {
    return String(
      getFoundrySettingsApi().get(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken) ?? "",
    );
  }

  private async promptForCode(suggestedCode: string, expiresAt: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const DialogClass = foundryUi.Dialog;
      if (!DialogClass) {
        reject(new Error("Foundry Dialog API is unavailable."));
        return;
      }

      new DialogClass({
        title: "Pair LoreBridge",
        content: `
          <p>The backend created pairing code <strong>${suggestedCode}</strong>.</p>
          <p>Confirm the code before ${new Date(expiresAt).toLocaleTimeString()}.</p>
          <div class="form-group">
            <label>Pairing Code</label>
            <input type="text" name="pairingCode" value="${suggestedCode}" autocomplete="one-time-code">
          </div>`,
        buttons: {
          pair: {
            icon: '<i class="fas fa-link"></i>',
            label: "Pair",
            callback: (html) =>
              resolve(String(html.find("input[name='pairingCode']").val() ?? "").trim()),
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(undefined),
          },
        },
        default: "pair",
        close: () => resolve(undefined),
      }).render(true);
    });
  }

  private notifyError(error: unknown): void {
    const message = error instanceof Error ? error.message : "LoreBridge operation failed.";
    ui.notifications.error(message);
  }
}
