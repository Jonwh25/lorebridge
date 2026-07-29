# LoreBridge Backend

Provider-neutral backend service for LoreBridge.

## Current scope

- `GET /health` service health response
- `GET /v1` protocol and capability discovery
- authenticated WebSocket adapter sessions at `/v1/adapter`
- authenticated adapter inventory at `GET /v1/adapters`
- environment-based configuration
- loopback-only default binding
- pairing and signed client authentication, disabled by default

No AI-provider credentials or provider-specific logic are included.

## Development

```bash
npm install
npm run validate
npm run start:backend
```

Defaults:

- host: `127.0.0.1`
- port: `3210`
- pairing: disabled
- pairing TTL: 300 seconds

Environment variables:

```bash
LOREBRIDGE_HOST=127.0.0.1
LOREBRIDGE_PORT=3210
LOREBRIDGE_PAIRING_ENABLED=false
LOREBRIDGE_PAIRING_TTL_SECONDS=300
```

Test health:

```bash
curl http://127.0.0.1:3210/health
```

## Live Foundry adapter session

A paired GM browser connects to:

```text
ws://127.0.0.1:3210/v1/adapter
```

For any non-local deployment, place the backend behind an HTTPS reverse proxy
and use `wss://`. The signed pairing token is sent in the initial adapter hello
message and must not travel over an unencrypted public connection.

After authentication, the adapter registers the active Foundry world and its
approved read-only capabilities. An authenticated diagnostic request can list
current sessions:

```text
GET /v1/adapters
Authorization: Bearer <paired-client-token>
```

This milestone registers live sessions only. Capability requests are not routed
over the WebSocket until the next transport slice.
