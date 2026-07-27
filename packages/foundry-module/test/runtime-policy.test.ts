import assert from "node:assert/strict";
import test from "node:test";

import { shouldExposeCapabilityApi } from "../src/runtime-policy.js";
import type { LoreBridgeSettings } from "../src/settings.js";

const enabledSettings: LoreBridgeSettings = {
  capabilityApiEnabled: true,
  remoteIntegrationEnabled: false,
  provider: "none",
  backendUrl: ""
};

test("exposes the capability API only to a GM when enabled", () => {
  assert.equal(shouldExposeCapabilityApi(true, enabledSettings), true);
  assert.equal(shouldExposeCapabilityApi(false, enabledSettings), false);
});

test("does not expose the capability API when the world toggle is disabled", () => {
  assert.equal(
    shouldExposeCapabilityApi(true, {
      ...enabledSettings,
      capabilityApiEnabled: false
    }),
    false
  );
});
