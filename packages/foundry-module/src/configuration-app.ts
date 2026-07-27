import { LoreBridgeBackendClient } from "./backend-client.js";
import { LOREBRIDGE_SETTINGS, getLoreBridgeSettings } from "./settings.js";

const MODULE_ID = "lorebridge";
const FormApplicationBase = (globalThis as unknown as {
  FormApplication: new (...args: any[]) => any;
}).FormApplication;

interface ConfigurationData {
  backendUrl: string;
  connectionStatus: string;
  backendId: string;
  fingerprint: string;
  paired: boolean;
}

export class LoreBridgeConfigurationApp extends FormApplicationBase {
  static override get defaultOptions(): Record<string, unknown> {
    return {
      ...super.defaultOptions,
      id: "lorebridge-configuration",
      title: "Configure LoreBridge",
      template: "modules/lorebridge/templates/configuration.hbs",
      width: 560,
      height: "auto",
      closeOnSubmit: false,
    };
  }

  override async getData(): Promise<ConfigurationData> {
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

  override activateListeners(html: any): void {
    super.activateListeners(html);
    html.find("[data-action='check']").on("click", () => void this.checkConnection());
    html.find("[data-action='pair']").on("click", () => void this.pair());
    html.find("[data-action='unpair']").on("click", () => void this.unpair());
  }

  protected override async _updateObject(_event: Event, formData: Record<string, unknown>): Promise<void> {
    const backendUrl = String(formData.backendUrl ?? "").trim();
    await game.settings.set(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, backendUrl);
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
      await game.settings.set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, result.token);
      ui.notifications.info(`LoreBridge paired with ${result.backendId}.`);
      await this.render(false);
    } catch (error) {
      this.notifyError(error);
    }
  }

  private async unpair(): Promise<void> {
    await game.settings.set(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken, "");
    ui.notifications.info("LoreBridge pairing removed from this browser.");
    await this.render(false);
  }

  private async saveBackendUrlFromForm(): Promise<string> {
    const element = this.element?.[0] as HTMLElement | undefined;
    const input = element?.querySelector<HTMLInputElement>("input[name='backendUrl']");
    const url = input?.value.trim() ?? getLoreBridgeSettings().backendUrl;
    await game.settings.set(MODULE_ID, LOREBRIDGE_SETTINGS.backendUrl, url);
    return url;
  }

  private clientToken(): string {
    return String(game.settings.get(MODULE_ID, LOREBRIDGE_SETTINGS.clientToken) ?? "");
  }

  private async promptForCode(suggestedCode: string, expiresAt: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      new Dialog({
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
            callback: (html: any) => resolve(String(html.find("input[name='pairingCode']").val() ?? "").trim()),
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
