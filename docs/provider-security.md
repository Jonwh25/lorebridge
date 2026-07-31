# Provider Configuration and Secret Boundary

LoreBridge keeps AI provider credentials entirely on the backend. They are
never stored in Foundry settings, browser code, or returned by any API.

## What the backend stores

- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — set as an environment variable in
  the pm2 ecosystem config or systemd unit file
- Validation result cached in memory for the lifetime of the process

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

Set the key in the pm2 ecosystem config on the backend host:

```js
// /home/azureuser/lorebridge-backend.config.cjs
module.exports = {
  apps: [{
    name: "lorebridge-backend",
    script: "/data/lorebridge/packages/backend/dist/server.js",
    env: {
      NODE_ENV: "production",
      LOREBRIDGE_PAIRING_ENABLED: "true",
      ANTHROPIC_API_KEY: "sk-ant-...",   // or OPENAI_API_KEY
    }
  }]
};
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
