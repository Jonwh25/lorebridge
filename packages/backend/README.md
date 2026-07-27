# LoreBridge Backend

Provider-neutral backend service for LoreBridge.

## Current scope

- `GET /health` service health response
- `GET /v1` protocol and capability discovery
- environment-based configuration
- loopback-only default binding
- pairing configuration foundation, disabled by default

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
