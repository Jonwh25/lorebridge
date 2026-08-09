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

### Milestone 12 — Portable Campaign Backups ✅

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

### Milestone 13 — Write Quality & Post-Session Workflow ✅

Improve the write-approval experience and close the loop between session play
and world documentation.

1. ✅ [Batch approval queue: review multiple AI-proposed edits in one flow](https://github.com/Jonwh25/lorebridge/issues/142)
2. ✅ [Post-session cleanup: detect new names and places from session notes and propose world entries](https://github.com/Jonwh25/lorebridge/issues/143)
3. ✅ [Diff-based journal editing: side-by-side preview with rollback after approval](https://github.com/Jonwh25/lorebridge/issues/144)
4. ✅ [Party journal export: generate a player-safe session recap for sharing outside Foundry](https://github.com/Jonwh25/lorebridge/issues/145)

Success test: a GM can finish a session, run post-session cleanup to surface
new world entries, approve a batch of proposed stubs in one review flow, see a
character-level diff before each write lands, roll back a mistake without
leaving Foundry, and hand players a clean shareable recap.

### Milestone 14 — Campaign Curation & Integrity ✅

Add source-backed tools that help a GM keep a long-running campaign coherent,
healthy, and intentionally scoped without applying automatic corrections.

1. ✅ [Campaign Health and Link Checker](https://github.com/Jonwh25/lorebridge/issues/169)
2. ✅ [Context Profiles](https://github.com/Jonwh25/lorebridge/issues/171)
3. ✅ [Campaign Consistency Auditor](https://github.com/Jonwh25/lorebridge/issues/167)

Deterministic health checks land first, followed by reusable context boundaries
and then AI-assisted canon analysis. Findings remain read-only and distinguish
source evidence from inference; any proposed correction uses the existing
preview and approval flow.

Success test: a GM audits a world, finds broken references and a seeded
contradiction, scopes the audit to one campaign region, and reviews exact
source citations without changing any document.

### Milestone 15 — Live Session Workspace ✅

Bring the most useful live-session context and roleplay controls into one
GM-facing Foundry workspace.

1. ✅ [Session Command Center](https://github.com/Jonwh25/lorebridge/issues/168)
2. ✅ [@NPC mention in chat for live in-character dialogue](https://github.com/Jonwh25/lorebridge/issues/116)
3. ✅ [Optional text-to-speech for NPC dialogue](https://github.com/Jonwh25/lorebridge/issues/112)

The command center composes existing bounded retrieval capabilities. Inline NPC
dialogue remains opt-in per actor, and speech remains an optional backend
provider capability whose credentials never enter Foundry.

Success test: a GM runs a session from one dashboard, reviews source-backed
live context, addresses an enabled NPC through chat, and optionally hears the
response without exposing hidden information.

### Milestone 16 — NPC Creation & Reuse ✅

Turn LoreBridge's existing NPC generation into a reviewable, reusable creation
workflow for complete D&D 5e actors and their artwork.

1. ✅ [Generation history](https://github.com/Jonwh25/lorebridge/issues/111)
2. ✅ [Full D&D 5e NPC stat block generation and actor creation](https://github.com/Jonwh25/lorebridge/issues/110)
3. ✅ [AI image generation for portraits, tokens, and item icons](https://github.com/Jonwh25/lorebridge/issues/109)

Generated mechanics and media are drafts. Actor creation and asset application
remain previewed, GM-approved writes, provider credentials remain backend-only,
and provider-specific capabilities are independently gated.

Success test: a GM generates a complete NPC, retains and reopens the output,
reviews the mechanical data and portrait, and explicitly approves creation in
Foundry without affecting unrelated actors or assets.

### Milestone 17 — NPC Profiles & AI Workspace ✅

Turn generated and existing NPCs into rich, modular GM references instead of a
single block of generated text.

1. ✅ [Enhance NPC Profiles with Structured GM Reference Sections](https://github.com/Jonwh25/lorebridge/issues/196)
2. ✅ [Redesign NPC Sheet into a Modular AI Workspace](https://github.com/Jonwh25/lorebridge/issues/197)
3. ✅ [NPC Workspace: smart language sync to dnd5e language checkboxes](https://github.com/Jonwh25/lorebridge/issues/206)

The profile model should capture identity, appearance, motivations,
relationships, secrets, history, gameplay context, and other GM-useful details.
Each major section is independently generated, regenerated, and edited while
using the rest of the NPC as consistency context. Existing sections must never
be overwritten unless the GM explicitly requests it.

The Foundry experience should present these sections as a focused workspace
rather than a wall of text, with section-level generation controls and a full
profile generation shortcut for new NPCs. Generated fields that duplicate
native dnd5e sheet fields (alignment, languages, ideal, bond, flaw, disposition,
biography) are synced back to the actor automatically; language sync matches
known dnd5e language keys and places non-standard languages in the Special
field.

Success test: a GM opens an existing NPC, generates only the missing Appearance
section, keeps the existing personality and history untouched, navigates
between structured profile sections, regenerates one section without changing
the others, and confirms that generated languages populate the correct dnd5e
language checkboxes rather than the free-text field.

### Milestone 18 — Safe Player Access ✅

Expose an explicitly published, permission-checked subset of campaign lore to
players inside Foundry.

1. ✅ [GM-published Player Lore Assistant](https://github.com/Jonwh25/lorebridge/issues/170)

Player access is disabled by default. Every request must satisfy both the GM's
publication allowlist and every non-GM user's current Foundry permissions
because player answers are posted to public chat.

Success test: a player receives source-cited answers only from GM-published
lore through Foundry, and revoked access takes effect immediately.

### Milestone 19 — Local-First Hybrid Search ✅ Complete

Improve context quality and reduce unnecessary AI calls by using local search
to identify likely sources before LoreBridge retrieves bounded content. This is
the next implementation priority after the completed deployment-version
housekeeping in [#224](https://github.com/Jonwh25/lorebridge/issues/224).

1. ✅ [Local-first hybrid search adapter using Spotlight and Foundry-native candidates](https://github.com/Jonwh25/lorebridge/issues/225)

The adapter combines Spotlight Omnisearch metadata candidates with Foundry v14
native collection search, then live-resolves every candidate and applies all
existing LoreBridge authorization, context-profile, visibility, folder, and
result-limit rules. Dig Down remains optional and is used only through its
enhancement of Foundry's native search. Existing journal, actor, scene, item,
compendium, asset, chat, and session-log scanners remain the authoritative
content-retrieval layer.

This direction follows the capability findings from
[Spike #223](https://github.com/Jonwh25/lorebridge/issues/223): candidate-first
search is intended to improve context selection and avoid unnecessary AI calls,
not replace LoreBridge scanners or solve an urgent raw-performance problem.

Success test: LoreBridge uses authorized local candidates to narrow context
before an AI request, safely falls back to existing scanners while Spotlight is
empty, rebuilding, stale, or unavailable, and never exposes a result that fails
live permission or context-profile enforcement.

### Milestone 20 — Controlled Live Operations ✅ Complete

Extend the write-approval model to time-sensitive combat mutations without
introducing automatic or generic Foundry writes.

1. ✅ [Tracking epic: controlled combat write operations](https://github.com/Jonwh25/lorebridge/issues/106)
2. ✅ [Combat-write approval contract, state snapshots, and GM UI](https://github.com/Jonwh25/lorebridge/issues/172)
3. ✅ [Advance the active combat to the next turn](https://github.com/Jonwh25/lorebridge/issues/173)
4. ✅ [Set one combatant initiative with conflict checks](https://github.com/Jonwh25/lorebridge/issues/174)
5. ✅ [End the active combat with destructive confirmation](https://github.com/Jonwh25/lorebridge/issues/175)

Combat writes are disabled by default. Every operation is narrowly typed,
GM-only, previewed, short-lived, single-use, validated against a captured
combat-state snapshot, and audited. Ending combat receives a distinct
destructive confirmation. No arbitrary JavaScript or generic document method
can be requested.

Success test: in a live Foundry v14 combat, the GM previews and approves one
turn advance, one initiative correction, and ending the encounter. Each valid
action affects only the previewed target, while expired, reused, or stale
proposals are rejected without changing combat state.

### Milestone 21 — Context Profile Depth

Deepen the reusable context-profile system with broader enforcement and
high-value quality-of-life controls.

1. [Context Profiles: enforcement in consistency auditor, active-scene toggle, and profile duplication](https://github.com/Jonwh25/lorebridge/issues/183)
2. [Context Profiles: get_related_documents enforcement and compendium exclusion per profile](https://github.com/Jonwh25/lorebridge/issues/184)

Success test: context profiles consistently bound the consistency auditor and
related-document retrieval, can optionally include the active scene, can be
duplicated safely, and can exclude selected compendia without changing default
behavior when no profile is active.

### Milestone 22 — Context Profile Advanced Scoping

Add finer-grained profile scoping and visibility into exactly what a profile
will include before it is used.

1. [Context Profiles: folder-level scoping](https://github.com/Jonwh25/lorebridge/issues/185)
2. [Context Profiles: profile preview](https://github.com/Jonwh25/lorebridge/issues/186)
3. [Context Profiles: source recheck at request time](https://github.com/Jonwh25/lorebridge/issues/187)

Success test: a GM scopes a profile to selected folders, previews the matched
sources before activation, and can safely continue using the profile after
sources are moved, deleted, or restricted.

### Milestone 23 — Campaign Memory Engine for Living NPCs

Add persistent NPC memory after the structured NPC model and AI workspace have
proven stable. This is intentionally a later milestone rather than part of the
Milestone 17 delivery scope.

1. [Campaign Memory Engine for Living NPCs](https://github.com/Jonwh25/lorebridge/issues/198)
2. [NPC Workspace: D&D 5e trait table picker and background field](https://github.com/Jonwh25/lorebridge/issues/207)

NPCs should accumulate meaningful campaign events, relationship changes,
promises, debts, betrayals, status changes, and other persistent history over
time. Future AI generation and roleplay can use that history as bounded context
so recurring NPCs remain consistent with what has actually happened in play.

The background field and D&D 5e trait picker (#207) deepen the structured NPC
identity established in Milestone 17 and lay groundwork for the memory engine:
a background-aware NPC with enriched personality traits is a more useful
subject for persistent memory than a bare stat block.

This milestone may later integrate session recap data, relationship graphs,
world-state changes, and campaign indexing, but it does not require semantic
search as a prerequisite.

Success test: after multiple recorded sessions, a recurring NPC retains a
reviewable timeline of important interactions and relationship changes, and a
new roleplay or profile-generation request incorporates approved memories
without rewriting unrelated NPC data.

## Deferred work

The following tracked features remain outside the current delivery milestones:

| Feature | Issue | Reason |
|---------|-------|--------|
| Persistent campaign content indexing | [#117](https://github.com/Jonwh25/lorebridge/issues/117) | Spotlight covers metadata discovery. Only content persistence, provenance, incremental fingerprints, synchronization, and permission partitions remain, and they should advance only after measured demand following #225. |
| Vector and semantic search | [#98](https://github.com/Jonwh25/lorebridge/issues/98) | Spike #223 found no current need to replace bounded lexical retrieval. Advance only with a representative query corpus demonstrating material failures that local-first hybrid search cannot address. |
| Discord adapter | [#120](https://github.com/Jonwh25/lorebridge/issues/120) | Secure identity linking, permission enforcement, bot hosting, and operational hardening require substantial work relative to the expected value. |

Additional VTT adapters and multi-world federation were closed as not planned;
LoreBridge remains focused on Foundry VTT and one connected world per backend.

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
