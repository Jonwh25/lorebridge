# LoreBridge

LoreBridge is a secure, GM-controlled bridge that lets an AI assistant retrieve
live campaign information from a loaded Foundry Virtual Tabletop world.

> [!IMPORTANT]
> LoreBridge is an early developer preview. The tools are read-only, but the
> authentication, configuration, and deployment process may still change between
> releases.

## How it works

```text
AI client (Claude, Codex, or any MCP client)
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

The AI client connects to the LoreBridge backend over HTTPS using the
[Model Context Protocol](https://modelcontextprotocol.io). The backend
authenticates the client with a pairing token and routes requests to a
Foundry module running in the GM's browser. The module executes a narrow
allowlist of read-only Foundry operations and returns structured data.

Provider credentials are never stored in Foundry. LoreBridge does not execute
arbitrary JavaScript or provide write access to the world.

## Current tools

| Tool | Description |
| --- | --- |
| `get_world_summary` | World identity, game system, and document counts |
| `search_journals` | Full-text search across journal names, page names, and page content |
| `get_journal_page` | Retrieve one journal page by ID |
| `search_actors` | Search actors by name or description, with optional type filtering |
| `get_actor` | Retrieve identity and descriptive information for one actor |

The world must be open in a GM browser for live tools to work. The Foundry
module connects automatically and reconnects after a backend restart.

## Requirements

- Foundry Virtual Tabletop v14
- A Foundry world open in a GM browser session
- Node.js 20 or newer and npm 10 or newer
- A host for the LoreBridge backend (Linux or Windows; running it on the same
  host as Foundry is the simplest deployment)
- A public HTTPS hostname and a reverse proxy (Caddy, Nginx, or IIS)
- An MCP client (Claude Desktop, Codex, or any client that supports MCP over
  HTTP with Bearer token authentication)

## Getting started

Full installation and configuration guides are on the
[LoreBridge Wiki](https://github.com/Jonwh25/lorebridge/wiki):

- [Installation overview](https://github.com/Jonwh25/lorebridge/wiki/Installation)
- [Backend setup — Linux](https://github.com/Jonwh25/lorebridge/wiki/Backend-Linux)
- [Backend setup — Windows](https://github.com/Jonwh25/lorebridge/wiki/Backend-Windows)
- [Reverse proxy — Caddy](https://github.com/Jonwh25/lorebridge/wiki/Reverse-Proxy-Caddy)
- [Reverse proxy — Nginx](https://github.com/Jonwh25/lorebridge/wiki/Reverse-Proxy-Nginx)
- [Reverse proxy — IIS](https://github.com/Jonwh25/lorebridge/wiki/Reverse-Proxy-IIS)
- [Pairing the Foundry module](https://github.com/Jonwh25/lorebridge/wiki/Foundry-Pairing)
- [Connecting an AI client](https://github.com/Jonwh25/lorebridge/wiki/AI-Client-Setup)
- [Updating LoreBridge](https://github.com/Jonwh25/lorebridge/wiki/Updating)
- [Troubleshooting](https://github.com/Jonwh25/lorebridge/wiki/Troubleshooting)

## Security model

- The backend binds to loopback (`127.0.0.1`) and is published through a
  reverse proxy over HTTPS; port 3210 is never exposed directly to the internet
- Every client — including the Foundry module — authenticates with a pairing
  token before any capability is available
- Each AI client uses its own dedicated token, separate from the Foundry browser
  token
- Tools are read-only; write capabilities are disabled at both the backend and
  adapter layer
- An explicit allowlist controls which Foundry operations the module may execute
- No arbitrary JavaScript is evaluated; no direct database or filesystem access
  is provided through MCP
- Provider credentials are never stored in or passed through Foundry

## Developer documentation

- [Architecture](ARCHITECTURE.md)
- [Capability reference](docs/CAPABILITIES.md)
- [Internal protocol](docs/LOREBRIDGE_PROTOCOL.md)
- [Contributing](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)
- [Releasing](docs/RELEASING.md)

## License

LoreBridge is released under the [MIT License](LICENSE).
