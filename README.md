# LoreBridge

LoreBridge is a secure, GM-controlled bridge that lets an AI assistant retrieve
live campaign information from a loaded Foundry Virtual Tabletop world.

The current version supports a complete read-only path:

```text
Codex or another MCP client
             |
             | HTTPS + MCP
             v
      LoreBridge backend
             |
             | authenticated WebSocket
             v
     LoreBridge Foundry module
             |
             v
      Loaded Foundry world
```

You can ask an MCP client a natural question such as:

> Search my Foundry journals for Tser Falls and summarize the relevant page.

LoreBridge retrieves only the relevant Foundry data and returns it to the
client. It does not put an AI provider key in Foundry, execute arbitrary
JavaScript, or provide write access to the world.

> [!IMPORTANT]
> LoreBridge is an early developer preview. The current tools are read-only,
> but the authentication, configuration, and deployment process may still
> change between releases.

## Current tools

- `get_world_summary` — returns the loaded world's identity, system, and
  document counts.
- `search_journals` — searches journal names, page names, and page text.
- `get_journal_page` — retrieves one focused journal page by journal and page
  ID.

LoreBridge currently requires the world to be open in a GM browser. The module
connects to the backend when the world becomes ready and automatically
reconnects after a temporary backend outage.

## Requirements

- Foundry Virtual Tabletop v14
- A Foundry world opened by a GM
- A Linux host for the LoreBridge backend (running it beside Foundry is the
  simplest deployment)
- Node.js 20 or newer and npm 10 or newer
- A public HTTPS hostname and reverse proxy such as Caddy
- An MCP client such as Codex

ChatGPT API billing and an OpenAI API key are **not** required for the Codex
route described below. Provider credentials are never stored in Foundry.

## 1. Install the Foundry module

In Foundry's Setup screen:

1. Open **Add-on Modules**.
2. Select **Install Module**.
3. Paste this manifest URL:

   ```text
   https://github.com/Jonwh25/lorebridge/releases/latest/download/module.json
   ```

4. Install LoreBridge.
5. Open the target world, choose **Manage Modules**, and enable LoreBridge.
6. Reload the world when Foundry asks.

The Foundry package manager can install later released versions from the same
manifest URL.

## 2. Install the backend

Run the backend as the normal service account that runs Foundry, not as root.
The examples below use `/data/lorebridge` for the repository and
`/data/lorebridge-data` for persistent backend identity data.

```bash
git clone https://github.com/Jonwh25/lorebridge.git /data/lorebridge
cd /data/lorebridge
npm install
npm run validate
npm run build --workspace=@lorebridge/backend
mkdir -p /data/lorebridge-data
```

### Run the backend with PM2

Find the absolute path to Node:

```bash
command -v node
```

Create a PM2 configuration using `vi`:

```bash
vi /home/YOUR_USER/lorebridge-backend.config.cjs
```

Paste the following, replacing `YOUR_USER` and the `interpreter` value with the
path returned by `command -v node`:

```javascript
module.exports = {
  apps: [
    {
      name: "lorebridge-backend",
      script: "/data/lorebridge/packages/backend/dist/server.js",
      cwd: "/data/lorebridge",
      interpreter: "/absolute/path/to/node",
      autorestart: true,
      watch: false,
      time: true,
      env: {
        NODE_ENV: "production",
        LOREBRIDGE_HOST: "127.0.0.1",
        LOREBRIDGE_PORT: "3210",
        LOREBRIDGE_PAIRING_ENABLED: "true",
        LOREBRIDGE_PAIRING_TTL_SECONDS: "300",
        LOREBRIDGE_DATA_DIR: "/data/lorebridge-data"
      }
    }
  ]
};
```

Start and verify the service:

```bash
pm2 start /home/YOUR_USER/lorebridge-backend.config.cjs
pm2 save
pm2 logs lorebridge-backend --lines 30 --nostream
curl -s http://127.0.0.1:3210/health
echo
```

The health response should resemble:

```json
{
  "status": "ok",
  "service": "lorebridge-backend",
  "version": "0.2.0",
  "pairingEnabled": true
}
```

Run `pm2 startup` and follow the machine-specific command it prints if PM2 is
not already configured to restore the service after reboot. Continue to run
ordinary `pm2` commands as the normal service account; do not create a separate
root-owned PM2 process list.

### Backend environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOREBRIDGE_HOST` | `127.0.0.1` | Backend listen address |
| `LOREBRIDGE_PORT` | `3210` | Backend listen port |
| `LOREBRIDGE_PAIRING_ENABLED` | `false` | Enables one-time client pairing |
| `LOREBRIDGE_PAIRING_TTL_SECONDS` | `300` | Pairing-code lifetime |
| `LOREBRIDGE_DATA_DIR` | `.lorebridge` | Persistent identity location |

Keep the data directory private and backed up. Its identity file contains the
secret used to validate paired clients. Do not publish or commit it.

## 3. Publish the backend through Caddy

Keep the Node service bound to `127.0.0.1`. Let Caddy provide public HTTPS and
proxy the `/lorebridge-api` path to the backend.

Edit the Caddyfile:

```bash
sudo vi /etc/caddy/Caddyfile
```

Add the LoreBridge handler **before** the handlers that proxy Foundry. Preserve
your existing Foundry routes:

```caddy
foundry.example.com {
        @lorebridge path /lorebridge-api /lorebridge-api/*
        handle_path @lorebridge {
                reverse_proxy 127.0.0.1:3210
        }

        # Keep the existing Foundry handlers below this block.
        handle {
                reverse_proxy 127.0.0.1:30000
        }
}
```

Validate and reload Caddy:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Test the public endpoint:

```bash
curl -s https://foundry.example.com/lorebridge-api/health
echo
```

Do not open port 3210 directly to the Internet.

## 4. Configure and pair Foundry

Open the Foundry world as a GM, then:

1. Go to **Game Settings → Configure Settings → Module Settings → LoreBridge**.
2. Enable **LoreBridge Capability API**.
3. Enable **Remote AI Integration**.
4. Leave **Remote AI Provider** set to **None** for MCP/Codex use.
5. Save the settings and reload the world.
6. Return to the LoreBridge settings and select **Configure LoreBridge**.
7. Enter the public backend base URL:

   ```text
   https://foundry.example.com/lorebridge-api
   ```

8. Select **Save URL**, then **Check Connection**.
9. Select **Pair** and confirm the one-time pairing code.

The panel should report **Connected** and **Paired: Yes**.

You can also verify the live adapter in the GM browser console:

```javascript
LoreBridge.getConnectionStatus()
```

Expected:

```javascript
{
  state: "connected",
  sessionId: "session_...",
  backendId: "lb_..."
}
```

The Foundry pairing token is stored as a client-scoped Foundry setting in that
browser. It is not an OpenAI API key.

## 5. Pair Codex with a dedicated token

Use a separate token for Codex instead of copying the Foundry browser token.
On the backend host, generate and immediately exchange a one-time pairing code:

```bash
PAIRING_CODE=$(
  curl -s -X POST http://127.0.0.1:3210/v1/pairing/start |
  node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).code'
)

PAIRING_RESULT=$(
  curl -s -X POST http://127.0.0.1:3210/v1/pairing/complete \
    -H 'Content-Type: application/json' \
    -d "{\"code\":\"${PAIRING_CODE}\",\"clientName\":\"Codex Desktop\"}"
)

TOKEN=$(
  printf '%s' "$PAIRING_RESULT" |
  node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).token'
)

printf '%s\n' "$TOKEN"
```

Copy the token privately, then clear the temporary shell values:

```bash
unset PAIRING_CODE PAIRING_RESULT TOKEN
```

Treat the token like a password. Do not paste it into chat, screenshots, issue
reports, shell history, or repository files.

### Store the token on Windows

In PowerShell:

```powershell
[Environment]::SetEnvironmentVariable(
  "LOREBRIDGE_CODEX_TOKEN",
  "PASTE_TOKEN_HERE",
  "User"
)
```

Close and reopen Codex after setting the environment variable.

### Configure the MCP server

Add this project-scoped configuration to `.codex/config.toml`, replacing the
hostname:

```toml
[mcp_servers.lorebridge]
url = "https://foundry.example.com/lorebridge-api/mcp"
bearer_token_env_var = "LOREBRIDGE_CODEX_TOKEN"
enabled = true
required = false
enabled_tools = [
  "get_world_summary",
  "search_journals",
  "get_journal_page",
]
default_tools_approval_mode = "auto"
```

Restart Codex so it reloads the environment and MCP configuration.

## 6. Use LoreBridge

Keep the Foundry world open in a paired GM browser. You can then ask Codex:

- “Use Foundry to tell me about Tser Falls.”
- “Search my Foundry journals for Vallaki and summarize the relevant pages.”
- “How many actors, scenes, and journals are in the loaded world?”
- “Find journal pages that mention the Sunsword.”

The client chooses the appropriate LoreBridge tools, retrieves the live data,
and cites the relevant journal and page in its answer.

## Updating LoreBridge

### Foundry module releases

Use Foundry's **Module Management** screen to check for and install released
module updates. Reload the world after an update.

### Backend and development builds

Update the repository and rebuild:

```bash
cd /data/lorebridge
git switch main
git pull --ff-only origin main
npm install
npm run validate
npm run build --workspace=@lorebridge/backend
pm2 restart lorebridge-backend
```

An already-open Foundry module should reconnect automatically after the backend
restart. Confirm with:

```javascript
LoreBridge.getConnectionStatus()
```

Do not tag every incremental change. Merge and test related improvements on
`main`, then prepare a versioned Foundry release when the group of changes is
ready for normal installation.

## Troubleshooting

### Public health check returns 404

- Confirm the Caddy LoreBridge handler appears before the catch-all Foundry
  handler.
- Confirm `handle_path` strips `/lorebridge-api` before proxying.
- Validate and reload Caddy after editing it.

### Foundry says it cannot connect

1. Verify the public health endpoint in the same browser.
2. Verify the configured backend URL ends at `/lorebridge-api`.
3. Confirm the backend is online:

   ```bash
   pm2 status
   pm2 logs lorebridge-backend --lines 100 --nostream
   ```

4. Confirm LoreBridge is enabled and the world is open as a GM.
5. Reload the world after changing the Remote AI Integration setting.

### MCP request returns 401

- Confirm `LOREBRIDGE_CODEX_TOKEN` exists in the environment that launched
  Codex.
- Create a fresh dedicated pairing token if the backend identity changed.
- Restart Codex after changing the environment variable.

### MCP reports that no adapter provides a tool

- Keep the Foundry world open in a paired GM browser.
- Check `LoreBridge.getConnectionStatus()` in the Foundry console.
- Wait for automatic reconnection after restarting the backend.
- Confirm the Foundry module and backend were built from compatible revisions.

### Pairing fails

Pairing codes are one-time values and expire after the configured TTL (five
minutes by default). Generate a new code and complete pairing immediately.

### Emergency token invalidation

Current tokens do not yet have individual server-side revocation. Removing
local pairing deletes the browser's token but does not revoke a copied token.
Rotating the backend identity invalidates every existing token and requires all
clients to pair again. Back up the data directory first and use identity
rotation only as a deliberate recovery action.

## Development

Common validation and packaging commands:

```bash
npm install
npm run validate
npm run build:foundry
npm run package:foundry
```

The Foundry module uses the public Foundry v14 API and ships as a browser-safe
ES module. The backend owns authentication, pairing, transport, and MCP. Shared
contracts live in the shared package.

See [VISION.md](VISION.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[ROADMAP.md](ROADMAP.md), and [CONTRIBUTING.md](CONTRIBUTING.md) for design and
contribution details.

## Security model

- GM-only Foundry capability exposure
- Read-only tools
- Explicit tool allowlist
- No arbitrary JavaScript execution
- No direct database or filesystem access from MCP
- Pairing token required for Foundry adapter and MCP access
- Backend bound to loopback and published through HTTPS
- Provider credentials kept out of Foundry

## License

LoreBridge is released under the [MIT License](LICENSE).
