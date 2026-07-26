# LoreBridge Roadmap

The roadmap favors small, testable milestones. Each milestone must work end to end before the next layer is added.

## Phase 0 — Foundation

- [x] Create repository
- [x] Define vision and guiding principles
- [x] Document the platform architecture
- [x] Create the TypeScript workspace
- [x] Add continuous validation
- [ ] Add formatting, linting, and tests
- [ ] Define contribution and security practices

## Phase 1 — Foundry adapter foundation

Goal: a Foundry VTT v14 module that installs, loads, and reports its status safely.

- [x] Create and validate `module.json`
- [x] Add `init` and `ready` lifecycle hooks
- [x] Restrict operation to a GM
- [ ] Install the module in the v14 test environment
- [ ] Confirm it loads with no console errors
- [ ] Add module settings
- [ ] Add a compact connection-status interface
- [ ] Add structured logging with secret redaction
- [ ] Package the module for manual installation

Success test: the module loads in the v14 test world with no console errors and displays world metadata locally.

## Phase 2 — Public capability contract

Goal: define stable, platform-neutral capabilities before connecting external services.

- [x] Establish initial capability naming and design rules
- [ ] Define protocol version and capability handshake
- [ ] Define source and document identifiers
- [ ] Define request, response, pagination, and error envelopes
- [ ] Define schemas for `getWorldSummary`
- [ ] Define schemas for journal operations
- [ ] Define schemas for actor operations
- [ ] Define schemas for scene operations
- [ ] Define schemas for compendium operations
- [ ] Add schema validation tests
- [ ] Add response-size conventions

Success test: fixtures validate consistently in the service, shared-contract, and Foundry packages.

## Phase 3 — LoreBridge service

Goal: connect adapters to a central service without exposing platform internals publicly.

- [ ] Create the service package
- [ ] Add authenticated persistent adapter connections
- [ ] Add source registration and capability negotiation
- [ ] Route correlated requests and responses
- [ ] Add timeouts, rate limits, and audit logs
- [ ] Add normalized structured errors
- [ ] Keep the service private or locally tunneled during development

Success test: a local command requests real world metadata through the service and receives a validated response from Foundry.

## Phase 4 — Read-only campaign capabilities

Goal: retrieve useful campaign data safely through the public contract.

- [ ] `getWorldSummary`
- [ ] `listJournals`
- [ ] `searchJournals`
- [ ] `getJournal`
- [ ] `listActors`
- [ ] `getActor`
- [ ] `listScenes`
- [ ] `getScene`
- [ ] `listCompendiums`
- [ ] `searchCompendium`
- [ ] `getCompendiumEntry`

Success test: an external client can answer a campaign question using retrieved Foundry data and identify every supporting source.

## Phase 5 — ChatGPT and client connections

Goal: interact with connected campaign sources from ChatGPT or another remote client.

- [ ] Expose approved capabilities through MCP
- [ ] Configure authenticated HTTPS transport
- [ ] Connect through the available ChatGPT developer/app workflow
- [ ] Verify tool discovery and invocation
- [ ] Test offline and timeout behavior
- [ ] Document installation and connection steps
- [ ] Keep the core service independent of any single AI provider

Success test: ask ChatGPT what world is connected and search its journals without entering the question inside Foundry.

## Phase 6 — Campaign intelligence

Goal: add higher-level tools built on reliable retrieval.

Potential capabilities:

- [ ] `summarizeCurrentScene`
- [ ] `findNpcRelationships`
- [ ] `findLocationMentions`
- [ ] `findUnresolvedPlotThreads`
- [ ] `buildSessionBrief`
- [ ] `summarizePartyHistory`

These capabilities must return supporting source references and distinguish sourced facts from inference.

## Phase 7 — Controlled writes

Goal: permit useful changes without surrendering GM control.

Potential capabilities:

- [ ] create a journal entry
- [ ] update a selected journal page
- [ ] append a private GM note
- [ ] create a proposed session recap
- [ ] create or update a selected actor

Required safeguards:

- preview before commit
- explicit confirmation token
- narrow document targeting
- before-and-after summary
- audit record
- bounded rollback strategy where supported

## Phase 8 — Additional adapters

Goal: connect more campaign platforms without changing the public capability model.

Potential adapters:

- [ ] LegendKeeper
- [ ] Obsidian
- [ ] additional VTTs
- [ ] transcript and session-summary sources
- [ ] D&D Beyond where technically and legally appropriate

Each adapter may implement a negotiated subset of LoreBridge capabilities.

## Later possibilities

- semantic campaign search
- multi-source and multi-world campaigns
- provider-specific client packages
- optional in-Foundry assistant panel
- packaged installers and automatic updates

Items in this section are not commitments for the first release.
