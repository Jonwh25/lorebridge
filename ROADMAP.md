# LoreBridge Roadmap

The roadmap favors small, testable milestones. Each milestone must work end to end before the next layer is added.

## Phase 0 — Foundation

- [x] Create repository
- [x] Define vision and guiding principles
- [x] Document the initial architecture
- [ ] Create the TypeScript workspace
- [ ] Add formatting, linting, tests, and continuous integration
- [ ] Define contribution and security practices

## Phase 1 — Foundry module skeleton

Goal: a Foundry VTT v14 module that installs, loads, and reports its status safely.

- [ ] Create `module.json`
- [ ] Add `init` and `ready` lifecycle hooks
- [ ] Restrict operation to an authenticated GM
- [ ] Add module settings
- [ ] Add a compact connection-status interface
- [ ] Add structured logging with secret redaction
- [ ] Package the module for manual installation

Success test: the module loads in the v14 test world with no console errors and displays world metadata locally.

## Phase 2 — Shared contracts

Goal: define stable, validated messages before connecting external services.

- [ ] Define protocol version and capability handshake
- [ ] Define request, response, and error envelopes
- [ ] Define schemas for `get_world_info`
- [ ] Define schemas for journal, actor, and scene operations
- [ ] Add schema validation tests
- [ ] Add response-size and pagination conventions

Success test: test fixtures validate consistently in both server and module packages.

## Phase 3 — Secure bridge

Goal: connect the Foundry module to a Node.js service without exposing Foundry internals publicly.

- [ ] Create the bridge/MCP server package
- [ ] Add authenticated persistent module connections
- [ ] Add world registration and connection status
- [ ] Route correlated requests and responses
- [ ] Add timeouts, rate limits, and audit logs
- [ ] Keep the service private or locally tunneled during development

Success test: a local command can request real world metadata through the server and receive a validated response from Foundry.

## Phase 4 — Read-only campaign tools

Goal: retrieve useful campaign data safely.

- [ ] `get_world_info`
- [ ] `list_journals`
- [ ] `search_journals`
- [ ] `get_journal`
- [ ] `list_actors`
- [ ] `get_actor`
- [ ] `list_scenes`
- [ ] `get_scene`
- [ ] `list_compendiums`
- [ ] `search_compendium`
- [ ] `get_compendium_entry`

Success test: an external client can answer a campaign question using retrieved Foundry data and identify the documents used.

## Phase 5 — ChatGPT/MCP connection

Goal: interact with Foundry from ChatGPT or another remote MCP client.

- [ ] Expose the approved read-only tools through MCP
- [ ] Configure authenticated HTTPS transport
- [ ] Connect through the available ChatGPT developer/app workflow
- [ ] Verify tool discovery and invocation
- [ ] Test offline and timeout behavior
- [ ] Document installation and connection steps

Success test: ask ChatGPT what world is connected and search its journals without entering the question inside Foundry.

## Phase 6 — Campaign intelligence

Goal: add higher-level tools built on reliable retrieval.

Potential tools:

- [ ] `summarize_current_scene`
- [ ] `find_npc_relationships`
- [ ] `find_location_mentions`
- [ ] `find_unresolved_plot_threads`
- [ ] `build_session_brief`
- [ ] `summarize_party_history`

These tools must return supporting document references and distinguish sourced facts from inference.

## Phase 7 — Controlled writes

Goal: permit useful changes without surrendering GM control.

Potential tools:

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
- bounded rollback strategy where Foundry supports it

## Later possibilities

- LegendKeeper connector
- transcript and session-summary ingestion
- semantic campaign search
- multi-world support
- additional VTTs and campaign platforms
- optional in-Foundry assistant panel
- packaged installers and automatic updates

Items in this section are not commitments for the first release.
