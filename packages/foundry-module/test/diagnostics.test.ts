import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDiagnosticsSummary,
  runDiagnostics,
  type DiagnosticsDependencies,
} from "../src/diagnostics.js";

function healthy(overrides: Partial<DiagnosticsDependencies> = {}): DiagnosticsDependencies {
  return {
    isGm: true,
    moduleVersion: "0.33.0",
    foundryVersion: "14.331",
    backendUrl: "https://example.invalid",
    clientToken: "do-not-copy-this-token",
    remoteIntegrationEnabled: true,
    adapterState: { state: "connected", sessionId: "private-session", backendId: "private-backend" },
    health: async () => ({ status: "ok", version: "0.33.0", pairingEnabled: true }),
    serviceInfo: async () => ({
      service: "lorebridge-backend",
      version: "0.33.0",
      protocolVersion: "0.1",
      capabilities: ["health", "backup/github"],
      providerEnabled: true,
      imageProviderEnabled: false,
    }),
    pairingStatus: async () => ({ paired: true, clientId: "private-client", backendId: "private-backend" }),
    now: () => new Date("2026-09-03T12:00:00.000Z"),
    ...overrides,
  };
}

test("diagnostics stop at the GM authorization boundary", async () => {
  let requests = 0;
  const report = await runDiagnostics(healthy({
    isGm: false,
    health: async () => { requests += 1; throw new Error("should not run"); },
    serviceInfo: async () => { requests += 1; throw new Error("should not run"); },
    pairingStatus: async () => { requests += 1; throw new Error("should not run"); },
  }));

  assert.equal(requests, 0);
  assert.equal(report.checks.find((check) => check.id === "gm-authorization")?.state, "failed");
});

test("healthy diagnostics report configured services without exposing identifiers", async () => {
  const report = await runDiagnostics(healthy());
  assert.deepEqual(
    Object.fromEntries(report.checks.map((check) => [check.id, check.state])),
    {
      module: "passed",
      "gm-authorization": "passed",
      backend: "passed",
      pairing: "passed",
      adapter: "passed",
      provider: "passed",
      github: "passed",
    },
  );
  assert.doesNotMatch(JSON.stringify(report), /private-(session|backend|client)/);
});

test("diagnostics distinguish unavailable, disabled, and not-configured states", async () => {
  const report = await runDiagnostics(healthy({
    clientToken: "",
    remoteIntegrationEnabled: false,
    health: async () => { throw new Error("fetch failed for https://secret.example/token"); },
    serviceInfo: async () => ({
      service: "lorebridge-backend",
      version: "0.33.0",
      protocolVersion: "0.1",
      capabilities: ["health"],
      providerEnabled: false,
      imageProviderEnabled: false,
    }),
  }));

  const states = Object.fromEntries(report.checks.map((check) => [check.id, check.state]));
  assert.equal(states.backend, "failed");
  assert.equal(states.pairing, "not-configured");
  assert.equal(states.adapter, "disabled");
  assert.equal(states.provider, "disabled");
  assert.equal(states.github, "not-configured");
  assert.doesNotMatch(JSON.stringify(report), /secret\.example/);
});

test("copied summary is bounded and uses a strict safe-field allowlist", async () => {
  const report = await runDiagnostics(healthy());
  report.checks.push({
    id: "attacker-controlled",
    label: "Authorization: Bearer secret-token",
    state: "failed",
    detail: "campaign content and api_key=secret",
    errorCode: "secret-token",
  });
  report.moduleVersion = "0.33.0 secret-token";

  const summary = formatDiagnosticsSummary(report);
  assert.ok(summary.length <= 2048);
  assert.match(summary, /LoreBridge: unavailable/);
  assert.match(summary, /Backend: passed/);
  assert.doesNotMatch(summary, /secret-token|api_key|campaign content|Bearer/);
});
