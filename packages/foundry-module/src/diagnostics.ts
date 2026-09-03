import type { AdapterConnectionState } from "./adapter-transport.js";
import type { BackendServiceInfo, PairingStatus } from "./backend-client.js";

export type DiagnosticState = "passed" | "failed" | "disabled" | "not-configured";

export interface DiagnosticCheck {
  id: string;
  label: string;
  state: DiagnosticState;
  detail: string;
  nextAction?: string;
  errorCode?: string;
}

export interface DiagnosticsReport {
  generatedAt: string;
  moduleVersion: string;
  foundryVersion: string;
  checks: DiagnosticCheck[];
}

export interface DiagnosticsDependencies {
  isGm: boolean;
  moduleVersion: string;
  foundryVersion: string;
  backendUrl: string;
  clientToken: string;
  remoteIntegrationEnabled: boolean;
  adapterState: AdapterConnectionState;
  health(): Promise<{ status: string; version: string; pairingEnabled: boolean }>;
  serviceInfo(): Promise<BackendServiceInfo>;
  pairingStatus(): Promise<PairingStatus>;
  now?: () => Date;
}

const SAFE_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,31}$/;
const SUMMARY_LABELS: Readonly<Record<string, string>> = {
  module: "LoreBridge module",
  "gm-authorization": "GM authorization",
  backend: "Backend",
  pairing: "Pairing",
  adapter: "Foundry adapter",
  provider: "AI provider",
  github: "GitHub backup",
};
const SUMMARY_ERROR_CODES = new Set([
  "authentication-failed",
  "backend-unreachable",
  "backend-http-error",
  "check-failed",
  "adapter-connecting",
  "adapter-disconnected",
]);

function safeValue(value: string): string {
  const trimmed = value.trim();
  return SAFE_VALUE.test(trimmed) ? trimmed : "unavailable";
}

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("unauthorized") || message.includes("not paired")) {
    return "authentication-failed";
  }
  if (message.includes("could not reach") || message.includes("fetch") || message.includes("network")) {
    return "backend-unreachable";
  }
  if (message.includes("http")) return "backend-http-error";
  return "check-failed";
}

export async function runDiagnostics(deps: DiagnosticsDependencies): Promise<DiagnosticsReport> {
  const report: DiagnosticsReport = {
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    moduleVersion: safeValue(deps.moduleVersion),
    foundryVersion: safeValue(deps.foundryVersion),
    checks: [],
  };

  report.checks.push({
    id: "module",
    label: "LoreBridge module",
    state: report.moduleVersion === "unavailable" ? "failed" : "passed",
    detail: report.moduleVersion === "unavailable" ? "Module version is unavailable." : `Version ${report.moduleVersion}`,
  });
  report.checks.push({
    id: "gm-authorization",
    label: "GM authorization",
    state: deps.isGm ? "passed" : "failed",
    detail: deps.isGm ? "Current user is a GM." : "Diagnostics are available to GMs only.",
    ...(!deps.isGm ? { nextAction: "Sign in as a GM and reopen LoreBridge Settings." } : {}),
  });

  if (!deps.isGm) return report;

  if (!deps.backendUrl) {
    report.checks.push(
      { id: "backend", label: "Backend", state: "not-configured", detail: "Backend URL is not configured.", nextAction: "Configure the Backend URL in Connection." },
      { id: "pairing", label: "Pairing", state: "not-configured", detail: "Pairing cannot be checked without a backend URL." },
      { id: "adapter", label: "Foundry adapter", state: "not-configured", detail: "Adapter requires a configured backend." },
      { id: "provider", label: "AI provider", state: "not-configured", detail: "Provider status is unavailable without a backend." },
      { id: "github", label: "GitHub backup", state: "not-configured", detail: "GitHub status is unavailable without a backend." },
    );
    return report;
  }

  const [healthResult, infoResult] = await Promise.allSettled([deps.health(), deps.serviceInfo()]);
  if (healthResult.status === "fulfilled") {
    const version = safeValue(healthResult.value.version);
    report.checks.push({ id: "backend", label: "Backend", state: "passed", detail: `Reachable, version ${version}` });
  } else {
    report.checks.push({
      id: "backend", label: "Backend", state: "failed", detail: "Backend could not be reached.",
      nextAction: "Check the Backend URL, reverse proxy, and backend process.", errorCode: failureCode(healthResult.reason),
    });
  }

  if (!deps.clientToken) {
    report.checks.push({ id: "pairing", label: "Pairing", state: "not-configured", detail: "This browser is not paired.", nextAction: "Pair this browser in Connection." });
  } else if (healthResult.status === "rejected") {
    report.checks.push({ id: "pairing", label: "Pairing", state: "failed", detail: "Pairing could not be verified while the backend is unavailable.", errorCode: "backend-unreachable" });
  } else {
    try {
      const pairing = await deps.pairingStatus();
      report.checks.push(pairing.paired
        ? { id: "pairing", label: "Pairing", state: "passed", detail: "This GM browser is paired." }
        : { id: "pairing", label: "Pairing", state: "failed", detail: "The saved pairing is not accepted.", nextAction: "Unpair and pair this browser again.", errorCode: "authentication-failed" });
    } catch (error) {
      report.checks.push({ id: "pairing", label: "Pairing", state: "failed", detail: "Pairing could not be verified.", nextAction: "Check the backend, then pair this browser again if needed.", errorCode: failureCode(error) });
    }
  }

  report.checks.push(adapterCheck(deps.remoteIntegrationEnabled, deps.adapterState, Boolean(deps.clientToken)));

  if (infoResult.status === "fulfilled") {
    report.checks.push(infoResult.value.providerEnabled
      ? { id: "provider", label: "AI provider", state: "passed", detail: "Configured on the backend." }
      : { id: "provider", label: "AI provider", state: "disabled", detail: "No provider is enabled on the backend." });
    report.checks.push(infoResult.value.capabilities.includes("backup/github")
      ? { id: "github", label: "GitHub backup", state: "passed", detail: "Configured on the backend." }
      : { id: "github", label: "GitHub backup", state: "not-configured", detail: "GitHub backup is not configured on the backend." });
  } else {
    const code = failureCode(infoResult.reason);
    report.checks.push(
      { id: "provider", label: "AI provider", state: "failed", detail: "Provider configuration status is unavailable.", errorCode: code },
      { id: "github", label: "GitHub backup", state: "failed", detail: "GitHub configuration status is unavailable.", errorCode: code },
    );
  }

  return report;
}

function adapterCheck(enabled: boolean, state: AdapterConnectionState, hasToken: boolean): DiagnosticCheck {
  if (!enabled) return { id: "adapter", label: "Foundry adapter", state: "disabled", detail: "Remote AI integration is disabled." };
  if (!hasToken) return { id: "adapter", label: "Foundry adapter", state: "not-configured", detail: "Adapter requires a paired browser." };
  if (state.state === "connected") return { id: "adapter", label: "Foundry adapter", state: "passed", detail: "Connected to the backend." };
  if (state.state === "connecting") return { id: "adapter", label: "Foundry adapter", state: "failed", detail: "Connection is still in progress.", nextAction: "Wait briefly, then run diagnostics again.", errorCode: "adapter-connecting" };
  return { id: "adapter", label: "Foundry adapter", state: "failed", detail: "Adapter is disconnected.", nextAction: "Check pairing and reload the Foundry world.", errorCode: "adapter-disconnected" };
}

export function formatDiagnosticsSummary(report: DiagnosticsReport): string {
  const lines = [
    "LoreBridge diagnostics",
    `Generated: ${report.generatedAt}`,
    `LoreBridge: ${safeValue(report.moduleVersion)}`,
    `Foundry: ${safeValue(report.foundryVersion)}`,
  ];
  for (const check of report.checks.slice(0, 10)) {
    const label = SUMMARY_LABELS[check.id];
    if (!label) continue;
    const code = check.errorCode && SUMMARY_ERROR_CODES.has(check.errorCode) ? ` (${check.errorCode})` : "";
    lines.push(`${label}: ${check.state}${code}`);
  }
  return lines.join("\n").slice(0, 2048);
}
