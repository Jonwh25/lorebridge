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

### Milestone 1 — Campaign Retrieval ✅ Complete

Complete the focused read-only Foundry document surface needed for everyday
campaign questions.

1. ✅ [Actor search and focused actor retrieval](https://github.com/Jonwh25/lorebridge/issues/44)
2. ✅ [Complete UUIDs and source citations](https://github.com/Jonwh25/lorebridge/issues/45)
3. ✅ [Scene search and focused scene retrieval](https://github.com/Jonwh25/lorebridge/issues/46)
4. ✅ [Active-scene context](https://github.com/Jonwh25/lorebridge/issues/47)

Success test: Codex can answer a location or NPC question from live Foundry
actors, journals, and scenes while identifying every supporting source.

### Milestone 2 — Connected Knowledge ✅ Complete

Connect campaign documents without introducing embeddings or an external
search database.

1. ✅ [Resolve Foundry UUID links](https://github.com/Jonwh25/lorebridge/issues/48)
2. ✅ [Unified campaign search](https://github.com/Jonwh25/lorebridge/issues/49)
3. ✅ [Related-document traversal](https://github.com/Jonwh25/lorebridge/issues/50)
4. ✅ [Player-safe and GM-only context modes](https://github.com/Jonwh25/lorebridge/issues/51)

Success test: a query about a location returns ranked, connected journal,
actor, and scene context while respecting the requested visibility mode.

### Milestone 3 — Foundry AI Generation ✅ Complete

Add optional AI generation inside Foundry without coupling MCP retrieval to one
provider or placing provider credentials in the browser.

1. ✅ [Optional backend AI-provider configuration](https://github.com/Jonwh25/lorebridge/issues/52)
2. ✅ [Preview-only boxed-text generation](https://github.com/Jonwh25/lorebridge/issues/53)

Success test: a GM selects a scene or journal page, requests a room
description, and receives a source-aware preview without changing the world.

### Milestone 4 — Campaign Intelligence ✅ Complete

Expand retrieval into the campaign's equipment, history, and reference
material.

1. ✅ [Item and actor-inventory retrieval](https://github.com/Jonwh25/lorebridge/issues/54)
2. ✅ [Session-log and campaign timeline retrieval](https://github.com/Jonwh25/lorebridge/issues/55)
3. ✅ [Compendium search and focused entry retrieval](https://github.com/Jonwh25/lorebridge/issues/56)

Success test: Codex can answer questions about party equipment, past events,
and approved compendium material with supporting sources.

### Milestone 5 — Controlled Writes ✅ Complete

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

### Milestone 6 — Write Approval UI ✅ Complete

Replace the console-based approval command with a native Foundry GM experience.

1. ✅ [Foundry chat UI for write approval](https://github.com/Jonwh25/lorebridge/issues/87)

When an AI proposes a journal update, a GM-only chat whisper appears in Foundry
showing the journal name, rationale, and a before/after summary with clickable
Approve and Reject buttons. No browser console access required.

Success test: GM can approve or reject a proposed journal update entirely within
the Foundry UI; expired and reused tokens are still rejected.

### Milestone 7 — Foundry UI: Chat & Core Buttons ✅ Complete

First GM-facing AI controls living inside Foundry — no MCP client or browser
console required.

1. ✅ [/lb chat command for in-world AI Q&A](https://github.com/Jonwh25/lorebridge/issues/97)
2. ✅ [Generate room description button on journal page and scene sheets](https://github.com/Jonwh25/lorebridge/issues/92)
3. ✅ [NPC Quick-Gen button on actor sheets](https://github.com/Jonwh25/lorebridge/issues/93)
4. ✅ [Session Recap Generator on session log journal](https://github.com/Jonwh25/lorebridge/issues/94)

Success test: a GM can type a question or click a button inside Foundry and
receive an AI-generated result without leaving the application or using the
browser console.

### Milestone 8 — Foundry UI: Scene, Journal & Roleplay ✅ Complete

Complete the Foundry UI surface with scene-level tools and live NPC
interaction.

1. ✅ [Scene Encounter Suggester button on scene sheets](https://github.com/Jonwh25/lorebridge/issues/95)
2. ✅ [Journal Page Q&A chat input on journal page sheets](https://github.com/Jonwh25/lorebridge/issues/96)
3. ✅ [Actor Roleplay: /lb roleplay command for in-character NPC conversations](https://github.com/Jonwh25/lorebridge/issues/99)

Success test: a GM can ask the AI a question scoped to a specific journal or
scene, and hold a short in-character conversation with an NPC, all from within
Foundry.

### Milestone 9 — World-Building Generation ✅ Complete

AI generates new campaign content and writes it back to Foundry through the
existing approval flow.

1. ✅ [Location and NPC Generator: towns, casts, and plot hooks](https://github.com/Jonwh25/lorebridge/issues/101)
2. ✅ [City and Location Description Generator: districts, landmarks, factions](https://github.com/Jonwh25/lorebridge/issues/102)
3. ✅ [Lazy DM Session Prep Generator](https://github.com/Jonwh25/lorebridge/issues/108)
4. ✅ [MCP tool: generate_roll_table](https://github.com/Jonwh25/lorebridge/issues/113)

Success test: a GM can ask the AI to generate a town, a session plan, or a
roll table; review the proposed content; and approve it into the world in one
flow without leaving Foundry.

### Milestone 10 — MCP Tool Expansion ✅ Complete

New read-only and utility MCP tools that give AI clients richer live-world
context.

1. ✅ [MCP tool: get_combat_state](https://github.com/Jonwh25/lorebridge/issues/103)
2. ✅ [MCP tool: roll_dice](https://github.com/Jonwh25/lorebridge/issues/104)
3. ✅ [MCP tool: get_chat_messages](https://github.com/Jonwh25/lorebridge/issues/105)
4. ✅ [MCP tool: search_assets](https://github.com/Jonwh25/lorebridge/issues/114)

Success test: an AI client can query active combat state, roll dice, retrieve
recent chat history, and locate existing image or audio assets in the Foundry
data directory.

### Milestone 11 — Extensibility & Configuration ✅ Complete

Power-user controls that let GMs tailor LoreBridge to their world and workflow
without requiring code changes.

1. ✅ [Per-category feature toggles in LoreBridge world settings](https://github.com/Jonwh25/lorebridge/issues/100)
2. ✅ [Ollama and OpenAI-compatible endpoint support for local AI](https://github.com/Jonwh25/lorebridge/issues/107)
3. ✅ [GM-authored Foundry macros as custom MCP tools](https://github.com/Jonwh25/lorebridge/issues/115)

Success test: a GM can disable individual capability categories, switch to a
local Ollama model, and expose a custom macro as an MCP tool without touching
the backend configuration.
 
### Milestone 12 — Portable Campaign Backups ✅ Complete

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

### Milestone 13 — Write Quality & Post-Session Workflow ✅ Complete

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

### Milestone 14 — Campaign Curation & Integrity ✅ Complete

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

### Milestone 15 — Live Session Workspace ✅ Complete

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

### Milestone 16 — NPC Creation & Reuse ✅ Complete

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

### Milestone 17 — NPC Profiles & AI Workspace ✅ Complete

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

### Milestone 18 — Safe Player Access ✅ Complete

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

### Milestone 21 — Context Profile Depth ✅ Complete

Deepen the reusable context-profile system with broader enforcement and
high-value quality-of-life controls.

1. ✅ [Context Profiles: enforcement in consistency auditor, active-scene toggle, and profile duplication](https://github.com/Jonwh25/lorebridge/issues/183)
2. ✅ [Context Profiles: get_related_documents enforcement and compendium exclusion per profile](https://github.com/Jonwh25/lorebridge/issues/184)

Success test: context profiles consistently bound the consistency auditor and
related-document retrieval, can optionally include the active scene, can be
duplicated safely, and can exclude selected compendia without changing default
behavior when no profile is active.

### Milestone 22 — Context Profile Advanced Scoping ✅ Complete

Add finer-grained profile scoping and visibility into exactly what a profile
will include before it is used, and consolidate LoreBridge configuration into
a coherent settings workspace that makes those access boundaries understandable.

1. ✅ [Context Profiles: folder-level scoping](https://github.com/Jonwh25/lorebridge/issues/185)
2. ✅ [Context Profiles: profile preview](https://github.com/Jonwh25/lorebridge/issues/186)
3. ✅ [Context Profiles: source recheck at request time](https://github.com/Jonwh25/lorebridge/issues/187)
4. ✅ [Redesign LoreBridge settings as a unified, logically grouped workspace](https://github.com/Jonwh25/lorebridge/issues/251)

Success test: a GM scopes a profile to selected folders, previews the matched
sources before activation, and can safely continue using the profile after
sources are moved, deleted, or restricted. LoreBridge configuration is available
through one resizable, logically grouped settings workspace that preserves
existing values, security boundaries, and predictable save behavior.

### Milestone 23 — Campaign Memory Engine for Living NPCs ✅ Complete

Add persistent NPC memory after the structured NPC model and AI workspace have
proven stable. This is intentionally a later milestone rather than part of the
Milestone 17 delivery scope.

1. ✅ [Campaign Memory Engine for Living NPCs](https://github.com/Jonwh25/lorebridge/issues/198)
2. ✅ [NPC Workspace: D&D 5e trait table picker and background field](https://github.com/Jonwh25/lorebridge/issues/207)

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

### Milestone 24 — Campaign Codex Integration: NPC Dossier Widget ✅ Complete

Add an optional Campaign Codex integration that registers a LoreBridge
**NPC Dossier** widget. Campaign Codex becomes the canonical store for
structured NPC narrative and campaign relationships; LoreBridge reads that
data for generation, roleplay, and future memory features instead of
maintaining a competing canonical profile.

1. ✅ [Campaign Codex integration: canonical NPC Dossier widget](https://github.com/Jonwh25/lorebridge/issues/258)

LoreBridge registers the widget only when Campaign Codex is active and
compatible, and continues to work without it. The widget provides a
structured, versioned dossier model covering reference, identity,
roleplaying guidance, conditional information, Q&A, knowledge, and
GM-only secrets using Foundry's native Secret block behavior. Generated
suggestions remain previewed and explicitly approved.

Success test: with Campaign Codex enabled, **LoreBridge NPC Dossier** appears
in Available Widgets; a GM can edit and persist every structured field and
repeatable row; the rendered dossier is usable at practical sizes with scrolling;
GM-only secrets are excluded from player-visible rendering and LoreBridge context;
LoreBridge generation prefers dossier data when present and falls back cleanly
when Campaign Codex is absent or disabled.

### Milestone 25 — Session and Character Portability ✅ Complete

Replace the remaining Character Vault workflows with bounded, GM-controlled
session provisioning, hotbar distribution, reset operations, and
permission-safe player character portability.

1. ✅ [Bulk user and actor creation with random passwords](https://github.com/Jonwh25/lorebridge/issues/230)
2. ✅ [Copy GM hotbar to all connected players](https://github.com/Jonwh25/lorebridge/issues/231)
3. ✅ [Remove all non-GM users for session reset](https://github.com/Jonwh25/lorebridge/issues/232)
4. ✅ [Player-driven actor import from GitHub backup](https://github.com/Jonwh25/lorebridge/issues/228)

The first three operations form a repeatable GM-controlled table setup and
reset workflow. User deletion and hotbar replacement must remain previewed,
explicitly confirmed, and narrowly targeted. Player-driven actor import is the
higher-risk final slice because it introduces LoreBridge's first player-visible
write surface; it must enforce actor ownership and prevent access to other
players' or GM-only backup data.

Success test: a GM can provision a new group, distribute approved hotbar pages,
and reset non-GM accounts with clear previews and confirmations. An authorized
player can restore only a character they own from the permitted backup surface,
with no access to other actors, GM data, or repository secrets.

### Post-Milestone 25 — Roadmap and 1.0 Readiness Review ✅ Complete

The [1.0 readiness review](https://github.com/Jonwh25/lorebridge/issues/244)
was completed after Milestone 25 (2026-08-11). Decision:

**LoreBridge will continue beta validation for approximately 3–4 months of
real-campaign use before a 1.0 stable release.**

Findings from the review:

- No open security defects, data-integrity gaps, or known bugs.
- All writes are GM-only, previewed, single-use token approved, and audited.
- The architecture and security model are solid across all 25 milestones.
- Features delivered in Milestones 23–25 (NPC memory, Campaign Codex widget,
  player actor import) are less than a week old and need soak time in real games.
- Spotlight Omnisearch was incorrectly listed as a required dependency; the
  code already fell back gracefully. Corrected to optional in [PR #264](https://github.com/Jonwh25/lorebridge/pull/264).
- All five deferred features remain post-1.0.

### Milestone 26 — Quality of Life & Small Enhancements ✅ Complete

An open, rolling milestone for smaller enhancements and polish items that don't
warrant a standalone milestone. Issues are collected here as they surface during
real-campaign use.

1. ✅ [NPC Dossier — Add Status field to Reference/Info tab](https://github.com/Jonwh25/lorebridge/issues/266)
2. ✅ [Session Log Reader — extend with unified read API and AI extraction utility](https://github.com/Jonwh25/lorebridge/issues/269) *(prerequisite for Milestone 27)*
3. ✅ [NPC Dossier — add killedBy and killedInSession fields to reference section](https://github.com/Jonwh25/lorebridge/issues/275)
4. ✅ [Global default visibility settings for LoreBridge custom NPC tabs](https://github.com/Jonwh25/lorebridge/issues/279)

Success test: each issue merged and passing its individual live acceptance test.

### Milestone 27 — Campaign Intelligence & Session Tracking ✅ Complete

AI-powered session log analysis that automatically tracks NPC status, party
encounters, quest progress, and region visits across the full campaign history.
Introduces a unified session reading and extraction layer, per-category JSON
tracking files, player permission automation, portrait auto-matching from
existing artwork, and a one-click post-session workflow.

**Depends on:** Milestone 26 #269 (Session Log Reader extension)

1. ✅ [NPC Status Tracker — track NPC alive/dead/ghost/undead status from session logs](https://github.com/Jonwh25/lorebridge/issues/270)
2. ✅ [NPC Encounter Tracker — track which NPCs the party has met and set player permissions](https://github.com/Jonwh25/lorebridge/issues/271)
3. ✅ [Quest Status Tracker — sync quest status from session logs to Campaign Codex](https://github.com/Jonwh25/lorebridge/issues/272)
4. ✅ [Region Visit Tracker — track visited regions and set player permissions](https://github.com/Jonwh25/lorebridge/issues/273)
5. ✅ [Player Permissions Sync — bulk set Observer on all encountered NPCs, visited regions, and active quests](https://github.com/Jonwh25/lorebridge/issues/274)
6. ✅ [Portrait Auto-Match — match existing portrait images to NPC journals from LoreBridge panel](https://github.com/Jonwh25/lorebridge/issues/276)
7. ✅ [Post-Session Checklist — single workflow button to process end-of-session updates](https://github.com/Jonwh25/lorebridge/issues/277)
8. ✅ [GitHub Backup — backup LoreBridge JSON files and Foundry macros to GitHub](https://github.com/Jonwh25/lorebridge/issues/278)
9. ✅ [CC Baseline — export Campaign Codex journal names and pre-populate tracker files](https://github.com/Jonwh25/lorebridge/issues/286)
10. ✅ [Session Log Creator — Add Session button with template pre-fill](https://github.com/Jonwh25/lorebridge/issues/288)
11. ✅ [CC Journal Export — export all Campaign Codex journal folders and Session Logs to GitHub](https://github.com/Jonwh25/lorebridge/issues/291)

Issues #270–274 are independent trackers that can be built in parallel. #277
and #278 depend on the tracker suite being complete. Portrait auto-match (#276)
is independent and can ship at any point during the milestone.

Success test: after a session, a GM runs the End of Session workflow, which
reads the latest session log, automatically detects NPC status changes, new
encounters, quest completions, and visited regions, pauses for GM confirmation
on ambiguous items, syncs player Observer permissions across all tracked
Campaign Codex journals, and commits all tracking data to GitHub in a single
operation. A separate "Match Portraits" pass matches existing artwork to NPC
journals by name without manual lookup.

### Milestone 28 — 1.0 Hardening ✅ Complete

Internal code quality and bug-fix milestone addressing issues surfaced from real
campaign use of Milestone 27 features. No new user-visible capabilities; all
changes improve reliability and correctness of existing features.

1. ✅ [Remove dead code: configuration-app, feature-settings-app, dossier-normalization](https://github.com/Jonwh25/lorebridge/issues/294)
2. ✅ [Consolidate duplicated utilities: buildBackendUrl, plainText, escHtml, SESSION_NUMBER_RE](https://github.com/Jonwh25/lorebridge/issues/295)
3. ✅ [CC Journal Export: write full content to GitHub and sync deletions](https://github.com/Jonwh25/lorebridge/issues/298)
4. ✅ [CC Journal Export: section picker — export only selected folders](https://github.com/Jonwh25/lorebridge/issues/301)

### Milestone 29 — Quality of Life & Efficiency ✅ Complete

Rolling milestone for smaller enhancements, performance improvements, and polish
items surfacing from real-campaign use. No new major capabilities; each issue is
independently mergeable.

This milestone redesigns the GitHub backup system to be fully configurable and
manual, replacing the old scattered backup buttons with a clean per-category
workflow and removing infrastructure that no longer fits the campaign's folder
structure.

1. ✅ [Settings: Add Backup Config section with configurable folder paths](https://github.com/Jonwh25/lorebridge/issues/305)
2. ✅ [SCC: Redesign Session Command Center — new GitHub Backups section](https://github.com/Jonwh25/lorebridge/issues/306)
3. ✅ [Module: Implement general backup capability functions (actors, journals, macros, session logs)](https://github.com/Jonwh25/lorebridge/issues/307)
4. ✅ [Module: Update Campaign Codex export to use configurable backup paths](https://github.com/Jonwh25/lorebridge/issues/308)
5. ✅ [Cleanup: Remove deprecated backup infrastructure](https://github.com/Jonwh25/lorebridge/issues/309)

Additional enhancements landed alongside this milestone:

- ✅ [Folder picker, progress dialog, recursive expansion, and full path hierarchy for all backup categories](https://github.com/Jonwh25/lorebridge/issues/317)

Success test: a GM configures custom folder paths in LoreBridge Settings,
manually triggers each backup category from the new GitHub Backups section in
the Session Command Center, and verifies that each category commits Markdown
files to the correct repo folder with full folder hierarchy preserved. A
folder-picker dialog appears before each actor and journal backup. No automated
backup runs without a button press. Old backup buttons, tracker backup columns,
and deprecated capability files are gone.

### Milestone 30 — Third-Party Module Compatibility ✅ Complete

Compatibility fixes for popular Foundry modules that conflict with LoreBridge,
identified through real-campaign use alongside other modules.

1. ✅ [fix: Material Deck compatibility — scene control button breaks Material Deck init](https://github.com/Jonwh25/lorebridge/issues/320)
2. ✅ [investigate: evaluate libWrapper integration for safe Foundry function patching](https://github.com/Jonwh25/lorebridge/issues/322)

Success test: a GM loads Foundry with both LoreBridge and Material Deck
(materialdeck-premium) enabled, opens the browser console, and sees no Material
Deck initialization errors. The LoreBridge bridge icon still appears in the
scene controls sidebar and opens the Session Command Center when clicked. Stream
Deck integration works normally.

### Milestone 31 — MCP Search & Filtering Improvements

Extend MCP search tools with folder context in results, optional folder filters,
and scoped-search parameters. Adds two new tools for roll tables and playlists.

1. ✅ [MCP search tools: add folderId/folderName to results and folder filter (journals, items, scenes, actors)](https://github.com/Jonwh25/lorebridge/issues/325)
2. ✅ [MCP search_journals: expose folder names in results and add journal ID filter parameter](https://github.com/Jonwh25/lorebridge/issues/324)
3. ✅ [MCP list_macro_tools: add folder context to results and optional folder filter](https://github.com/Jonwh25/lorebridge/issues/328)
4. [MCP: add search_roll_tables tool](https://github.com/Jonwh25/lorebridge/issues/326)
5. [MCP: add playlist support (list, search, playback state)](https://github.com/Jonwh25/lorebridge/issues/327)
6. ✅ [MCP: add list_macros tool to list all world macros with isCallable flag and optional folderId filter](https://github.com/Jonwh25/lorebridge/issues/333)

Issues #325 and #324 overlap on `search_journals` folder fields; #325 lands first
to establish the pattern across all four primary search tools, then #324 adds only
the journal ID filter on top. #328 is independent. #326 and #327 are new tools
that follow the same search shape and ship after the folder-filter work is proven.

Success test: an AI caller can retrieve folder context alongside every search
result, filter any search to a single folder by ID, scope a journal search to one
journal, discover existing roll tables, and query playlist state — without any
regression to existing search behavior when the new parameters are omitted.

## Deferred work

The following tracked features remain outside the current delivery milestones:

| Feature | Issue | Reason |
|---------|-------|--------|
| Persistent campaign content indexing | [#117](https://github.com/Jonwh25/lorebridge/issues/117) | Spotlight covers metadata discovery. Only content persistence, provenance, incremental fingerprints, synchronization, and permission partitions remain, and they should advance only after measured demand following #225. |
| Vector and semantic search | [#98](https://github.com/Jonwh25/lorebridge/issues/98) | Spike #223 found no current need to replace bounded lexical retrieval. Advance only with a representative query corpus demonstrating material failures that local-first hybrid search cannot address. |
| Discord adapter | [#120](https://github.com/Jonwh25/lorebridge/issues/120) | Secure identity linking, permission enforcement, bot hosting, and operational hardening require substantial work relative to the expected value. |
| Campaign Memory Engine: Phase 2 — enrichment and management | [#255](https://github.com/Jonwh25/lorebridge/issues/255) | Depends on #198 proving the basic memory capture model in production. AI summarization, relationship categories, session tagging, NPC-to-NPC sharing, and a visualization graph are all additive enrichments; advance after the 1.0 readiness review if the core memory system demonstrates clear demand for richer structure. |
| NPC dossier data migration macro | [#260](https://github.com/Jonwh25/lorebridge/issues/260) | When the Campaign Codex integration is disabled, dossier flag data is inaccessible but not deleted. A migration macro and re-import path would let GMs export dossier content to plain journal pages and recover it without re-enabling the feature. Advance after Milestone 24 ships and demand is confirmed. |

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
