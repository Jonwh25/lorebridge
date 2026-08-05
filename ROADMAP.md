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

### Milestone 1 — Campaign Retrieval ✅

Complete the focused read-only Foundry document surface needed for everyday
campaign questions.

1. ✅ [Actor search and focused actor retrieval](https://github.com/Jonwh25/lorebridge/issues/44)
2. ✅ [Complete UUIDs and source citations](https://github.com/Jonwh25/lorebridge/issues/45)
3. ✅ [Scene search and focused scene retrieval](https://github.com/Jonwh25/lorebridge/issues/46)
4. ✅ [Active-scene context](https://github.com/Jonwh25/lorebridge/issues/47)

Success test: Codex can answer a location or NPC question from live Foundry
actors, journals, and scenes while identifying every supporting source.

### Milestone 2 — Connected Knowledge ✅

Connect campaign documents without introducing embeddings or an external
search database.

1. ✅ [Resolve Foundry UUID links](https://github.com/Jonwh25/lorebridge/issues/48)
2. ✅ [Unified campaign search](https://github.com/Jonwh25/lorebridge/issues/49)
3. ✅ [Related-document traversal](https://github.com/Jonwh25/lorebridge/issues/50)
4. ✅ [Player-safe and GM-only context modes](https://github.com/Jonwh25/lorebridge/issues/51)

Success test: a query about a location returns ranked, connected journal,
actor, and scene context while respecting the requested visibility mode.

### Milestone 3 — Foundry AI Generation ✅

Add optional AI generation inside Foundry without coupling MCP retrieval to one
provider or placing provider credentials in the browser.

1. ✅ [Optional backend AI-provider configuration](https://github.com/Jonwh25/lorebridge/issues/52)
2. ✅ [Preview-only boxed-text generation](https://github.com/Jonwh25/lorebridge/issues/53)

Success test: a GM selects a scene or journal page, requests a room
description, and receives a source-aware preview without changing the world.

### Milestone 4 — Campaign Intelligence ✅

Expand retrieval into the campaign's equipment, history, and reference
material.

1. ✅ [Item and actor-inventory retrieval](https://github.com/Jonwh25/lorebridge/issues/54)
2. ✅ [Session-log and campaign timeline retrieval](https://github.com/Jonwh25/lorebridge/issues/55)
3. ✅ [Compendium search and focused entry retrieval](https://github.com/Jonwh25/lorebridge/issues/56)

Success test: Codex can answer questions about party equipment, past events,
and approved compendium material with supporting sources.

### Milestone 5 — Controlled Writes ✅

Introduce narrowly scoped Foundry mutations only after the read-only model is
stable.

1. ✅ [Previewed, GM-approved write operations](https://github.com/Jonwh25/lorebridge/issues/57)

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

### Milestone 6 — Write Approval UI ✅

Replace the console-based approval command with a native Foundry GM experience.

1. ✅ [Foundry chat UI for write approval](https://github.com/Jonwh25/lorebridge/issues/87)

When an AI proposes a journal update, a GM-only chat whisper appears in Foundry
showing the journal name, rationale, and a before/after summary with clickable
Approve and Reject buttons. No browser console access required.

Success test: GM can approve or reject a proposed journal update entirely within
the Foundry UI; expired and reused tokens are still rejected.

### Milestone 7 — Foundry UI: Chat & Core Buttons ✅

First GM-facing AI controls living inside Foundry — no MCP client or browser
console required.

1. ✅ [/lb chat command for in-world AI Q&A](https://github.com/Jonwh25/lorebridge/issues/97)
2. ✅ [Generate room description button on journal page and scene sheets](https://github.com/Jonwh25/lorebridge/issues/92)
3. ✅ [NPC Quick-Gen button on actor sheets](https://github.com/Jonwh25/lorebridge/issues/93)
4. ✅ [Session Recap Generator on session log journal](https://github.com/Jonwh25/lorebridge/issues/94)

Success test: a GM can type a question or click a button inside Foundry and
receive an AI-generated result without leaving the application or using the
browser console.

### Milestone 8 — Foundry UI: Scene, Journal & Roleplay ✅

Complete the Foundry UI surface with scene-level tools and live NPC
interaction.

1. ✅ [Scene Encounter Suggester button on scene sheets](https://github.com/Jonwh25/lorebridge/issues/95)
2. ✅ [Journal Page Q&A chat input on journal page sheets](https://github.com/Jonwh25/lorebridge/issues/96)
3. ✅ [Actor Roleplay: /lb roleplay command for in-character NPC conversations](https://github.com/Jonwh25/lorebridge/issues/99)

Success test: a GM can ask the AI a question scoped to a specific journal or
scene, and hold a short in-character conversation with an NPC, all from within
Foundry.

### Milestone 9 — World-Building Generation ✅

AI generates new campaign content and writes it back to Foundry through the
existing approval flow.

1. ✅ [Location and NPC Generator: towns, casts, and plot hooks](https://github.com/Jonwh25/lorebridge/issues/101)
2. ✅ [City and Location Description Generator: districts, landmarks, factions](https://github.com/Jonwh25/lorebridge/issues/102)
3. ✅ [Lazy DM Session Prep Generator](https://github.com/Jonwh25/lorebridge/issues/108)
4. ✅ [MCP tool: generate_roll_table](https://github.com/Jonwh25/lorebridge/issues/113)

Success test: a GM can ask the AI to generate a town, a session plan, or a
roll table; review the proposed content; and approve it into the world in one
flow without leaving Foundry.

### Milestone 10 — MCP Tool Expansion ✅

New read-only and utility MCP tools that give AI clients richer live-world
context.

1. ✅ [MCP tool: get_combat_state](https://github.com/Jonwh25/lorebridge/issues/103)
2. ✅ [MCP tool: roll_dice](https://github.com/Jonwh25/lorebridge/issues/104)
3. ✅ [MCP tool: get_chat_messages](https://github.com/Jonwh25/lorebridge/issues/105)
4. ✅ [MCP tool: search_assets](https://github.com/Jonwh25/lorebridge/issues/114)

Success test: an AI client can query active combat state, roll dice, retrieve
recent chat history, and locate existing image or audio assets in the Foundry
data directory.

### Milestone 11 — Extensibility & Configuration ✅

Power-user controls that let GMs tailor LoreBridge to their world and workflow
without requiring code changes.

1. ✅ [Per-category feature toggles in LoreBridge world settings](https://github.com/Jonwh25/lorebridge/issues/100)
2. ✅ [Ollama and OpenAI-compatible endpoint support for local AI](https://github.com/Jonwh25/lorebridge/issues/107)
3. ✅ [GM-authored Foundry macros as custom MCP tools](https://github.com/Jonwh25/lorebridge/issues/115)

Success test: a GM can disable individual capability categories, switch to a
local Ollama model, and expose a custom macro as an MCP tool without touching
the backend configuration.

### Milestone 12 — Portable Campaign Backups

Export selected campaign content to a version-controlled repository and restore
it through explicit, conflict-aware GM approval. The portable representation is
based on [The Raven's Eye](https://github.com/Jonwh25/the-ravens-eye), while
Foundry-specific reconstruction data remains in a versioned extension rather
than becoming part of the platform-independent core specification.

Implementation begins only after The Raven's Eye publishes an experimental,
versioned draft covering document identity, visibility, relationships,
provenance, extensions, and schema evolution.

1. ✅ [Tracking epic: Raven's Eye portable campaign backups and restore](https://github.com/Jonwh25/lorebridge/issues/128)
2. ✅ [Define the Raven's Eye interoperability contract](https://github.com/Jonwh25/lorebridge/issues/133)
3. ✅ [Connect the backend to a private GitHub campaign repository](https://github.com/Jonwh25/lorebridge/issues/134)
4. ✅ [Back up and restore Foundry journals](https://github.com/Jonwh25/lorebridge/issues/135)
5. ✅ [Back up and restore Foundry actors and roll tables](https://github.com/Jonwh25/lorebridge/issues/130)
6. ✅ [Back up a Foundry scene folder as a Raven's Eye campaign area](https://github.com/Jonwh25/lorebridge/issues/129)
7. ✅ [Restore a scene folder with UUID remapping and conflict checks](https://github.com/Jonwh25/lorebridge/issues/132)
8. ✅ [Browse, compare, and select point-in-time campaign backups](https://github.com/Jonwh25/lorebridge/issues/131)

GitHub is the first storage adapter, not a requirement of The Raven's Eye.
Repository credentials stay in the backend, campaign repositories default to
private, exports remain bounded, and every restore requires a validated preview,
explicit single-use GM approval, conflict checks, and an audit result.

Success test: a GM backs up a representative campaign folder to a private
GitHub repository, reviews the resulting commit, changes the world, previews a
restore from a selected commit, explicitly approves it, and verifies that
supported documents and references are restored without exposing secrets or
overwriting unrelated content.

### Milestone 13 — Write Quality & Post-Session Workflow

Improve the write-approval experience and close the loop between session play
and world documentation.

1. [Batch approval queue: review multiple AI-proposed edits in one flow](https://github.com/Jonwh25/lorebridge/issues/142)
2. [Post-session cleanup: detect new names and places from session notes and propose world entries](https://github.com/Jonwh25/lorebridge/issues/143)
3. [Diff-based journal editing: side-by-side preview with rollback after approval](https://github.com/Jonwh25/lorebridge/issues/144)
4. [Party journal export: generate a player-safe session recap for sharing outside Foundry](https://github.com/Jonwh25/lorebridge/issues/145)

Success test: a GM can finish a session, run post-session cleanup to surface
new world entries, approve a batch of proposed stubs in one review flow, see a
character-level diff before each write lands, roll back a mistake without
leaving Foundry, and hand players a clean shareable recap.

## Deferred work

The following have tracking issues but are intentionally outside the current
milestones. They may become useful later but are not prerequisites for a
dependable Foundry campaign assistant.

| Feature | Issue |
|---------|-------|
| Vector store indexing for semantic world search | [#98](https://github.com/Jonwh25/lorebridge/issues/98) |
| Autonomous background campaign indexing | [#117](https://github.com/Jonwh25/lorebridge/issues/117) |
| Combat write operations (next turn, initiative, end combat) | [#106](https://github.com/Jonwh25/lorebridge/issues/106) |
| AI image generation for NPC portraits, tokens, and item icons | [#109](https://github.com/Jonwh25/lorebridge/issues/109) |
| Full D&D 5e NPC stat block generation and actor creation | [#110](https://github.com/Jonwh25/lorebridge/issues/110) |
| Generation history: save and reuse recent AI output | [#111](https://github.com/Jonwh25/lorebridge/issues/111) |
| Text-to-speech for NPC dialogue via ElevenLabs | [#112](https://github.com/Jonwh25/lorebridge/issues/112) |
| @NPC mention in chat for live in-character dialogue | [#116](https://github.com/Jonwh25/lorebridge/issues/116) |
| Additional VTT adapters (Roll20, Owlbear Rodeo) | [#118](https://github.com/Jonwh25/lorebridge/issues/118) |
| Multi-world federation | [#119](https://github.com/Jonwh25/lorebridge/issues/119) |
| Discord adapter | [#120](https://github.com/Jonwh25/lorebridge/issues/120) |

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
- Milestone: one of the delivery milestones above

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
