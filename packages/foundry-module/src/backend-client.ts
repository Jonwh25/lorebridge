export interface BackendIdentity {
  id: string;
  fingerprint: string;
  createdAt: string;
}

export interface PairingResult {
  token: string;
  clientId: string;
  backendId: string;
  fingerprint: string;
}

export interface PairingStatus {
  paired: boolean;
  backendId?: string;
  clientId?: string;
  clientName?: string;
}

export interface BackendServiceInfo {
  service: string;
  version: string;
  protocolVersion: string;
  capabilities: string[];
  providerEnabled: boolean;
  imageProviderEnabled: boolean;
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export function createBackendRequestUrl(baseUrl: string, path: string): URL {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("Configure the LoreBridge Backend URL first.");
  const normalizedBase = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase);
}

export class LoreBridgeBackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token = "",
  ) {}

  async health(): Promise<{ status: string; version: string; pairingEnabled: boolean }> {
    return this.request("/health");
  }

  async identity(): Promise<BackendIdentity> {
    return this.request("/v1/identity");
  }

  async serviceInfo(): Promise<BackendServiceInfo> {
    return this.request("/v1");
  }

  async startPairing(): Promise<{ code: string; expiresAt: string }> {
    return this.request("/v1/pairing/start", { method: "POST" });
  }

  async completePairing(code: string, clientName: string): Promise<PairingResult> {
    return this.request("/v1/pairing/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, clientName }),
    });
  }

  async pairingStatus(): Promise<PairingStatus> {
    return this.request("/v1/pairing/status", { authenticated: true });
  }

  private async request<T>(
    path: string,
    options: RequestInit & { authenticated?: boolean } = {},
  ): Promise<T> {
    const url = createBackendRequestUrl(this.baseUrl, path);
    const headers = new Headers(options.headers);
    if (options.authenticated) {
      if (!this.token) throw new Error("LoreBridge is not paired with this backend.");
      headers.set("authorization", `Bearer ${this.token}`);
    }

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, cache: "no-store" });
    } catch (error) {
      throw new Error(
        `Could not reach the LoreBridge backend at ${url.origin}. Check the URL, reverse proxy, and browser network access.`,
        { cause: error },
      );
    }

    const body = await response.json().catch(() => ({})) as T & ErrorBody;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `LoreBridge backend returned HTTP ${response.status}.`);
    }
    return body;
  }

}
