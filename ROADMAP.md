# LoreBridge Roadmap

LoreBridge is developed in small, testable vertical slices. Each slice must
work through the complete path—shared contract, Foundry adapter, authenticated
backend, MCP tool, automated tests, and live Foundry verification—before it is
considered complete.

GitHub Issues are the source of truth for planned work. This file records the
stable direction and milestone order rather than duplicating every task.

## Current state

The first complete read-only integration is working:

```text
Codex
  → authenticated HTTPS/MCP
  → LoreBridge backend
  → authenticated WebSocket adapter session
  → LoreBridge Foundry v14 module
  → loaded GM world
```

Completed foundations include:

- Foundry v14 module packaging and automatic releases
- GM-only capability exposure and world settings
- Backend identity, pairing, and client authentication
- Caddy HTTPS reverse-proxy deployment
- Persistent authenticated Foundry adapter sessions
- Automatic adapter startup retry and reconnection
- Shared protocol envelopes and runtime validation
- MCP discovery and authenticated tool invocation
- `get_world_summary`
- `search_journals`
- `get_journal_page`
- End-to-end retrieval from Codex against the live Curse of Strahd world
- Installation, operation, upgrade, and troubleshooting documentation

All current capabilities are read-only.

## Delivery order

### Milestone 1 — Campaign Retrieval

Complete the focused read-only Foundry document surface needed for everyday
campaign questions.

1. [Actor search and focused actor retrieval](https://github.com/Jonwh25/lorebridge/issues/44)
2. [Complete UUIDs and source citations](https://github.com/Jonwh25/lorebridge/issues/45)
3. [Scene search and focused scene retrieval](https://github.com/Jonwh25/lorebridge/issues/46)
4. [Active-scene context](https://github.com/Jonwh25/lorebridge/issues/47)

Success test: Codex can answer a location or NPC question from live Foundry
actors, journals, and scenes while identifying every supporting source.

### Milestone 2 — Connected Knowledge

Connect campaign documents without introducing embeddings or an external
search database.

1. [Resolve Foundry UUID links](https://github.com/Jonwh25/lorebridge/issues/48)
2. [Unified campaign search](https://github.com/Jonwh25/lorebridge/issues/49)
3. [Related-document traversal](https://github.com/Jonwh25/lorebridge/issues/50)
4. [Player-safe and GM-only context modes](https://github.com/Jonwh25/lorebridge/issues/51)

Success test: a query about a location returns ranked, connected journal,
actor, and scene context while respecting the requested visibility mode.

### Milestone 3 — Foundry AI Generation

Add optional AI generation inside Foundry without coupling MCP retrieval to one
provider or placing provider credentials in the browser.

1. [Optional backend AI-provider configuration](https://github.com/Jonwh25/lorebridge/issues/52)
2. [Preview-only boxed-text generation](https://github.com/Jonwh25/lorebridge/issues/53)

Success test: a GM selects a scene or journal page, requests a room
description, and receives a source-aware preview without changing the world.

### Milestone 4 — Campaign Intelligence

Expand retrieval into the campaign's equipment, history, and reference
material.

1. [Item and actor-inventory retrieval](https://github.com/Jonwh25/lorebridge/issues/54)
2. [Session-log and campaign timeline retrieval](https://github.com/Jonwh25/lorebridge/issues/55)
3. [Compendium search and focused entry retrieval](https://github.com/Jonwh25/lorebridge/issues/56)

Success test: Codex can answer questions about party equipment, past events,
and approved compendium material with supporting sources.

### Milestone 5 — Controlled Writes

Introduce narrowly scoped Foundry mutations only after the read-only model is
stable.

1. [Previewed, GM-approved write operations](https://github.com/Jonwh25/lorebridge/issues/57)

Required safeguards:

- writes disabled by default
- per-capability enablement
- dry-run preview
- explicit, short-lived, single-use GM approval
- narrow document targeting
- revision and conflict checks
- before-and-after summary
- audit record
- no arbitrary JavaScript execution

Success test: no write occurs until the GM approves the exact proposed change,
and stale or reused approval tokens are rejected.

## Deferred work

The following remain intentionally outside the current milestones:

- embeddings and vector databases
- autonomous background campaign indexing
- unrestricted workflow or macro execution
- automatic document mutations
- additional VTT adapters
- LegendKeeper, Obsidian, Notion, and Discord adapters
- multi-world federation
- semantic campaign memory not grounded in attributable sources

These may become useful later, but they are not prerequisites for a dependable
Foundry campaign assistant.

## Planning workflow

LoreBridge uses a lightweight workflow:

1. Capture each concrete feature, bug, or engineering improvement as a GitHub
   Issue.
2. Assign one priority label, the relevant area labels, and a milestone.
3. Move only well-defined work into **Ready**.
4. Create a feature branch linked to the issue.
5. Open a draft pull request and keep it in **In Progress**.
6. Run automated validation and a proportionate live Foundry test.
7. Move the work to **Testing**, then merge only after it passes.
8. Close the linked issue and move it to **Done**.
9. Group several verified incremental changes into a release instead of
   versioning every merge.

Recommended project-board columns:

```text
Backlog → Ready → In Progress → Testing → Done
```

Recommended metadata:

- Priority: critical, high, medium, later
- Area: Foundry, backend, MCP, protocol, security, documentation
- Milestone: one of the five delivery milestones above

## Tooling strategy

GitHub remains the canonical home for:

- source code
- issues and backlog
- roadmap
- pull requests and reviews
- releases

Azure DevOps may be added as complementary engineering infrastructure when it
becomes available:

- self-hosted validation pipelines
- Test Plans for repeatable live Foundry acceptance tests
- Artifacts for retained build and test outputs

Azure DevOps should not become a second manually maintained backlog. GitHub
Issues remain the planning source of truth unless an explicit migration is
chosen later.
