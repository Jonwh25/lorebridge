import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  getLoreBridgeSettings,
  LOREBRIDGE_SETTINGS,
  registerLoreBridgeSettings,
} from "../src/settings.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");

afterEach(() => {
  if (originalGame) {
    Object.defineProperty(globalThis, "game", originalGame);
  } else {
    Reflect.deleteProperty(globalThis, "game");
  }
});

function setGame(value: unknown): void {
  Object.defineProperty(globalThis, "game", {
    value,
    configurable: true,
    writable: true,
  });
}

test("registers safe world and client scoped defaults", () => {
  const registrations = new Map<string, Record<string, unknown>>();
  const menus = new Map<string, Record<string, unknown>>();

  setGame({
    settings: {
      register(_moduleId: string, key: string, config: Record<string, unknown>) {
        registrations.set(key, config);
      },
      registerMenu(_moduleId: string, key: string, config: Record<string, unknown>) {
        menus.set(key, config);
      },
      get() {
        return undefined;
      },
      async set() {
        return undefined;
      },
    },
  });

  registerLoreBridgeSettings();

  assert.equal(menus.size, 1);
  assert.equal(menus.get("configuration")?.restricted, true);

  assert.equal(registrations.size, 5);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.capabilityApiEnabled)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)?.default, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.provider)?.default, "none");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backendUrl)?.default, "");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.clientToken)?.default, "");

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.capabilityApiEnabled)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.capabilityApiEnabled)?.config, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)?.config, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.provider)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.provider)?.config, true);

  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backendUrl)?.scope, "world");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backendUrl)?.config, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.clientToken)?.scope, "client");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.clientToken)?.config, false);
});

test("reads and normalizes configured values", () => {
  const values = new Map<string, unknown>([
    [LOREBRIDGE_SETTINGS.capabilityApiEnabled, true],
    [LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, true],
    [LOREBRIDGE_SETTINGS.provider, "openai"],
    [LOREBRIDGE_SETTINGS.backendUrl, "  https://lorebridge.example/api/  "],
    [LOREBRIDGE_SETTINGS.clientToken, "signed-client-token"],
  ]);

  setGame({
    settings: {
      register() {},
      registerMenu() {},
      get(_moduleId: string, key: string) {
        return values.get(key);
      },
      async set() {
        return undefined;
      },
    },
  });

  assert.deepEqual(getLoreBridgeSettings(), {
    capabilityApiEnabled: true,
    remoteIntegrationEnabled: true,
    provider: "openai",
    backendUrl: "https://lorebridge.example/api/",
    clientToken: "signed-client-token",
  });
});

test("falls back to provider none for unsupported values", () => {
  setGame({
    settings: {
      register() {},
      registerMenu() {},
      get(_moduleId: string, key: string) {
        if (key === LOREBRIDGE_SETTINGS.provider) return "unexpected-provider";
        return false;
      },
      async set() {
        return undefined;
      },
    },
  });

  assert.equal(getLoreBridgeSettings().provider, "none");
});
