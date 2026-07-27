import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  getLoreBridgeSettings,
  LOREBRIDGE_SETTINGS,
  registerLoreBridgeSettings
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
    writable: true
  });
}

test("registers safe world-scoped defaults", () => {
  const registrations = new Map<string, Record<string, unknown>>();

  setGame({
    settings: {
      register(_moduleId: string, key: string, config: Record<string, unknown>) {
        registrations.set(key, config);
      },
      get() {
        return undefined;
      }
    }
  });

  registerLoreBridgeSettings();

  assert.equal(registrations.size, 4);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.capabilityApiEnabled)?.default, true);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.remoteIntegrationEnabled)?.default, false);
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.provider)?.default, "none");
  assert.equal(registrations.get(LOREBRIDGE_SETTINGS.backendUrl)?.default, "");

  for (const registration of registrations.values()) {
    assert.equal(registration.scope, "world");
    assert.equal(registration.config, true);
  }
});

test("reads and normalizes configured values", () => {
  const values = new Map<string, unknown>([
    [LOREBRIDGE_SETTINGS.capabilityApiEnabled, true],
    [LOREBRIDGE_SETTINGS.remoteIntegrationEnabled, true],
    [LOREBRIDGE_SETTINGS.provider, "openai"],
    [LOREBRIDGE_SETTINGS.backendUrl, "  wss://lorebridge.example/ws  "]
  ]);

  setGame({
    settings: {
      register() {},
      get(_moduleId: string, key: string) {
        return values.get(key);
      }
    }
  });

  assert.deepEqual(getLoreBridgeSettings(), {
    capabilityApiEnabled: true,
    remoteIntegrationEnabled: true,
    provider: "openai",
    backendUrl: "wss://lorebridge.example/ws"
  });
});

test("falls back to provider none for unsupported values", () => {
  setGame({
    settings: {
      register() {},
      get(_moduleId: string, key: string) {
        if (key === LOREBRIDGE_SETTINGS.provider) return "unexpected-provider";
        return false;
      }
    }
  });

  assert.equal(getLoreBridgeSettings().provider, "none");
});
