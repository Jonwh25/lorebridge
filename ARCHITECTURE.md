# LoreBridge Architecture

## Overview

LoreBridge is a platform for connecting AI clients to approved tabletop RPG data and actions. Foundry VTT is the first adapter, not the entire product.

```text
AI clients
(ChatGPT, Claude, Gemini, custom clients)
                |
                | MCP or another authenticated client protocol
                v
        LoreBridge service
                |
                | versioned LoreBridge capability protocol
        +-------+-------------------+
        |                           |
        v                           v
Foundry adapter              Future adapters
                             (LegendKeeper,
                              Obsidian,
                              other VTTs,
                              campaign tools)
        |
        | platform-native APIs
        v
Loaded Foundry world
```

The public LoreBridge capability contract is independent of transport and platform implementation. A capability such as `getActor` should mean the same thing whether the request arrives through MCP, HTTPS, a local command, or a future client protocol.

## Components

### LoreBridge service

A Node.js service hosted alongside or near the connected campaign platforms.

Responsibilities:

- expose approved LoreBridge capabilities to authenticated clients
- authenticate client and adapter connections
- validate capability inputs and outputs
- route requests to the correct connected campaign source
- enforce permissions, timeouts, limits, and read-only policy
- maintain an audit trail without logging secrets
- normalize adapter responses into stable LoreBridge formats
- return structured errors when a source is unavailable
- support future higher-level campaign intelligence

The service is the orchestration layer. It must not directly read Foundry database files.

### Foundry adapter

A small Foundry VTT v14 module loaded in the active world by a GM.

Responsibilities:

- establish an outbound authenticated connection to the LoreBridge service
- advertise world identity and supported capabilities
- execute a narrow allowlist of Foundry operations
- translate Foundry documents into shared LoreBridge response formats
- enforce GM-only and world-level settings
- display connection status and request history
- request explicit approval for future write operations

The Foundry module will not contain an AI model, AI-provider API key, campaign reasoning engine, or provider-specific business logic.

### Future adapters

LegendKeeper, Obsidian, additional VTTs, and other campaign tools can implement the same capability contract. Each adapter is responsible only for translating between its native platform and LoreBridge contracts.

An adapter may support only a subset of capabilities. Capability negotiation tells the service what is available for each connected source.

### Shared contracts

A shared TypeScript package will define:

- capability names
- input and output schemas
- stable source and document identifiers
- request, response, and error envelopes
- protocol versions
- capability declarations
- pagination and response-size conventions
- approval and confirmation messages for future writes

Schemas will be versioned so the service and adapters can detect incompatible versions.

## Initial repository layout

```text
lorebridge/
├── packages/
│   ├── foundry-module/
│   ├── service/
│   └── shared/
├── docs/
│   └── CAPABILITIES.md
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── ROADMAP.md
├── VISION.md
└── README.md
```

The service package may initially expose MCP directly. Provider-specific entry points can be added without changing the core capability contract.

## Example request flow

Example: `searchJournals`

1. An authenticated AI client invokes the capability with a search query.
2. The LoreBridge service validates the request and selects a permitted connected source.
3. The service sends a versioned request with a unique correlation ID to the Foundry adapter.
4. The adapter confirms that the active user is a GM and journal search is allowed.
5. The adapter searches journal names and page text using Foundry public document APIs.
6. The adapter returns bounded results with stable source references.
7. The service validates and normalizes the response.
8. The client receives structured results identifying the supporting Foundry documents and pages.

## Security model

The first release will use these controls:

- TLS for all external traffic
- long random connection credentials stored outside source control
- short-lived authenticated sessions where practical
- outbound connections initiated by adapters
- one explicit allowlisted handler per capability
- input schema validation at both boundaries
- output-size and result-count limits
- request timeouts and rate limits
- read-only mode enforced by both service and adapter
- no evaluation of model-generated code
- no arbitrary platform method invocation
- secret values redacted from logs

Authentication details will be finalized before the bridge is exposed publicly.

## Availability constraint

In the initial Foundry implementation, all of the following must be true for live tools to work:

- the Foundry server is running
- the target world is loaded
- a GM browser session has the LoreBridge module active
- the adapter is connected to the LoreBridge service

A future server-side Foundry integration may remove the active-browser requirement, but that is outside the first release.

## Capability design rules

- Capabilities describe useful GM intentions rather than raw database access.
- Read operations return compact summaries by default and detailed content only when requested.
- Every response includes stable source identifiers so a later request can target one record precisely.
- Search results identify the platform document and page or entry source.
- Platform-specific fields are isolated in optional metadata rather than becoming the public contract.
- Unsupported capabilities fail clearly instead of being approximated silently.
- Higher-level intelligence distinguishes sourced facts from inference.
- Write capabilities require preview, narrow targeting, explicit confirmation, audit records, and rollback where practical.
