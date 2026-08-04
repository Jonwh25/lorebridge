# Provider Configuration and Secret Boundary

LoreBridge keeps AI provider credentials entirely on the backend. They are
never stored in Foundry settings, browser code, or returned by any API.

## What the backend stores

- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — set as an environment variable in
  the pm2 ecosystem config or systemd unit file
- `OPENAI_BASE_URL` (optional) — overrides the OpenAI endpoint for any
  OpenAI-compatible server; must include `/v1` (e.g. `http://localhost:1234/v1`)
- `OPENAI_MODEL` (optional) — overrides the default OpenAI model (`gpt-4o-mini`)
- `OLLAMA_BASE_URL` — enables the Ollama provider (e.g. `http://localhost:11434`);
  no API key required
- `OLLAMA_MODEL` (optional) — selects the Ollama model (default `llama3.2`)
- Validation result cached in memory for the lifetime of the process

Provider priority: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `OLLAMA_BASE_URL`.

## What the backend exposes

The `/v1/provider/status` endpoint (auth required) returns only:

```json
{ "provider": "anthropic", "enabled": true, "healthy": true }
```

The key itself is never included in any response, log entry, or MCP tool output.

## What Foundry stores

- `backendUrl` — the HTTPS URL of the LoreBridge backend
- `clientToken` — a pairing token issued by the backend for the GM browser session

Neither of these values provides access to provider credentials.

## Why credentials belong on the backend

Foundry modules execute in the browser. Any value available to the module is
visible to the GM browser session's developer tools and may be accessible to
other browser-side code or modules. Provider API keys placed there would be
exposed regardless of whether they appear in world settings or the module
bundle.

## Connection model

```text
AI assistant or MCP client
        |  HTTPS + Bearer token
LoreBridge backend
  - provider credentials (env vars)
  - client authentication
  - input validation
  - rate limits
        |  authenticated WebSocket
LoreBridge Foundry module
  - approved read-only capabilities
  - GM/world feature toggles
  - no provider secrets
```

## Configuring a provider

Set the relevant env vars in the pm2 ecosystem config on the backend host:

**Anthropic (Claude):**

```js
// /home/azureuser/lorebridge-backend.config.cjs
module.exports = {
  apps: [{
    name: "lorebridge-backend",
    script: "/data/lorebridge/packages/backend/dist/server.js",
    env: {
      NODE_ENV: "production",
      LOREBRIDGE_PAIRING_ENABLED: "true",
      ANTHROPIC_API_KEY: "sk-ant-...",
    }
  }]
};
```

**OpenAI or OpenAI-compatible (e.g. LM Studio):**

```js
env: {
  LOREBRIDGE_PAIRING_ENABLED: "true",
  OPENAI_API_KEY: "sk-...",
  OPENAI_BASE_URL: "http://localhost:1234/v1",  // omit for openai.com
  OPENAI_MODEL: "mistral-7b",                   // omit for gpt-4o-mini
}
```

**Ollama (local, no API key):**

```js
env: {
  LOREBRIDGE_PAIRING_ENABLED: "true",
  OLLAMA_BASE_URL: "http://localhost:11434",
  OLLAMA_MODEL: "llama3.2",   // optional, this is the default
}
```

Then restart the backend:

```bash
pm2 restart lorebridge-backend
```

Verify the provider is healthy:

```bash
curl -s -H "Authorization: Bearer <token>" \
  https://<your-host>/lorebridge-api/v1/provider/status | jq
```

Expected response: `{"provider":"anthropic","enabled":true,"healthy":true}`.

See the [Provider setup](https://github.com/Jonwh25/lorebridge/wiki/Provider-Setup) wiki page for full acquisition and verification steps.

## High-risk features

Write operations, destructive operations, script macros, and arbitrary code
execution remain disabled by default and require separate explicit authorization
controls.
