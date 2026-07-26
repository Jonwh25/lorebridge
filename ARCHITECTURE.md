# LoreBridge Architecture

## Overview

LoreBridge will use separate components so that Foundry access, transport, AI protocols, and user-facing controls can evolve independently.

```text
AI client
   |
   | MCP over authenticated HTTPS
   v
LoreBridge MCP server
   |
   | authenticated persistent connection
   v
LoreBridge Foundry module
   |
   | Foundry document APIs
   v
Loaded Foundry world
```

## Components

### MCP server

A Node.js service hosted alongside or near the Foundry server.

Responsibilities:

- expose approved LoreBridge tools to remote MCP clients
- authenticate client connections
- validate tool inputs and outputs
- route requests to the correct connected Foundry world
- enforce timeouts, limits, and read-only policy
- maintain an audit trail without logging secrets
- return structured errors when Foundry is unavailable

The MCP server must not directly read Foundry database files.

### Foundry module

A Foundry VTT v14 module loaded in the active world by an authenticated GM.

Responsibilities:

- establish an outbound authenticated connection to the LoreBridge server
- advertise world identity and supported capabilities
- execute an allowlisted set of Foundry operations
- serialize Foundry documents into stable LoreBridge response formats
- enforce GM-only and world-level settings
- display connection status and request history
- request approval for future write operations

The module will not contain an AI model or an AI-provider API key.

### Shared contracts

A shared TypeScript package will define:

- tool names
- input schemas
- output schemas
- error codes
- protocol messages
- capability declarations

Schemas will be versioned so the MCP server and Foundry module can detect incompatible versions.

## Initial repository layout

```text
lorebridge/
├── packages/
│   ├── foundry-module/
│   ├── mcp-server/
│   └── shared/
├── docs/
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── ROADMAP.md
├── VISION.md
└── README.md
```

## Initial request flow

Example: `search_journals`

1. The AI client calls the MCP tool with a search query.
2. The MCP server validates the request and confirms that a permitted Foundry world is connected.
3. The server sends a request with a unique correlation ID to the Foundry module.
4. The module confirms that the active user is a GM and that journal search is allowed.
5. The module searches journal names and page text using Foundry's public document APIs.
6. The module returns bounded, structured results.
7. The MCP server validates and returns the results to the AI client.

## Security model

The first release will use these controls:

- TLS for all external traffic
- long random connection credentials stored outside source control
- short-lived authenticated sessions where practical
- outbound connection initiated by the Foundry module
- one explicit allowlisted handler per tool
- input schema validation at both boundaries
- output size and result-count limits
- request timeouts and rate limits
- read-only mode enforced by both server and module
- no evaluation of model-generated code
- no arbitrary Foundry document method invocation
- secret values redacted from logs

Authentication details will be finalized before the bridge is exposed publicly.

## Availability constraint

In the initial implementation, the following must be true for live Foundry tools to work:

- the Foundry server is running
- the target world is loaded
- a GM browser session has the LoreBridge module active
- the module is connected to the MCP server

A future server-side integration may remove the active-browser requirement, but that is outside the first release.

## Tool design rules

- Tools should describe useful GM intentions rather than expose raw database access.
- Read tools return compact summaries by default and detailed content only when requested.
- Every response includes stable identifiers so a later call can target one document precisely.
- Search results must identify their Foundry document and page source.
- Write tools, when introduced, must support preview and explicit confirmation.
