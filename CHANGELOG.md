# Changelog

All notable changes to LoreBridge are documented here.

## [Unreleased]

### Added

- **Per-category feature toggles**: a GM-only **Configure Features** settings button now groups toggles for Foundry UI buttons, `/lb` chat commands, the Journal Page Q&A panel, and AI-proposed writes. Disabled UI features disappear immediately, and disabled chat commands are ignored.

## [0.10.0] - 2026-08-03

### Added

- **Milestone 10 — MCP Tool Expansion**: `get_combat_state` returns active initiative, turn state, and GM/player-safe combatant details; `roll_dice` uses Foundry's native dice engine with optional explicit public chat posting; `get_chat_messages` returns bounded recent chat with visibility filtering and roll details; and `search_assets` finds configured Foundry data-directory image and audio assets, returning bounded Foundry-relative paths.

### Fixed

- Pairing dialog now reads the pairing code through the Foundry v14 dialog form API.
- Asset search handles nested folders and normalizes spaces, underscores, and punctuation in filename matching.

## [0.9.0] - 2026-08-01

### Added

- **Lazy DM Session Prep Generator**: wizard-hat button on Session Log journal sheets generates a complete 8-section Lazy DM prep document (Strong Start, Potential Scenes, Secrets & Clues, Fantastic Locations, Important NPCs, Monsters, Treasure) grounded in session notes and campaign search results. Saved to a GM-only "Lazy DM Prep" journal with auto-incremented page names (e.g. "Prep Session 2"); journal opens automatically after saving.
- **`/lb city <description>`** chat command: generates a full city/location profile (overview, history, districts, landmarks, factions, hooks, sensory details) grounded in existing campaign lore. Preview dialog with Save as Journal → creates a page in "Generated Locations" and opens the journal.
- **`/lb npcs [count] <description>`** chat command: generates a cast of NPCs (default 5, max 10) for a described location, each with role, appearance, personality, mannerism, secret, and hook. Saves to "Generated Locations" journal. Optional leading count: `/lb npcs 3 village of Barovia`.
- **`generate_roll_table` MCP tool**: AI-callable tool that generates a themed roll table (2–20 entries, default 10) and proposes it to the GM via an approval dialog. On approval, creates a Foundry `RollTable` document with a `1dN` formula and text entries. Uses a new `roll-table.approval.required` event.

### Fixed

- LoreBridge startup info messages moved from Foundry notification toasts to `console.info` only — no more blue banners on every reload.
- Chat input is now always cleared after `/lb city`, `/lb npcs`, `/lb roleplay`, `/lb end`, and in-roleplay messages.

## [0.8.0] - 2026-07-31

### Added

- **Scene Encounter Suggester**: dice icon button in scene sheet headers generates 2–3 encounter hooks grounded in the scene name, linked journal, and tokens on the scene. Result shown in a dialog (z-index above the scene config panel).
- **Journal Page Q&A**: question-mark input panel injected at the bottom of journal sheets. Type a question and click the button to get an AI answer grounded in the active page content; result displayed in a GM-only chat whisper.
- **`/lb roleplay <name>`** chat command: starts an in-character NPC conversation using the actor's biography as context. Type `/lb <message>` to speak with the NPC; type `/lb end` to exit. History bounded to last 20 turns. Responses whispered to GM users only.

## [0.7.0] - 2026-07-31

### Added

- **Write approval dialog**: when the AI calls `propose_journal_update`, a GM-only chat whisper appears in Foundry and a native dialog popup opens automatically with the journal name, page, rationale, scrollable content preview, and **Approve** / **Reject** buttons. No browser console access required.
- `LoreBridge.rejectWrite(token)` Foundry GM console fallback for explicit token rejection.
- `POST /v1/write/reject` backend endpoint: marks a write token as used without executing a write, preventing later approval.
- Backend pushes an `approval.required` WebSocket event to the connected Foundry module immediately after a write is proposed, delivering the dialog without polling.
- Write approval dialog uses Foundry v13 `DialogV2` (ApplicationV2 framework) to avoid deprecation warnings and support native theming and resizing.

### Fixed

- Windows data directory now has file ACL restricted to the running user via `icacls`, preventing other local accounts from reading the LoreBridge data directory or key file.

## [0.6.0] - 2026-07-31

### Added

- `propose_journal_update` MCP tool: AI assistants can propose a replacement for any journal page's HTML content. The tool fetches the current page, stores a pending write with a 5-minute single-use token, and returns a before/after preview and an approval instruction to the AI. No content is modified until the GM explicitly approves.
- `LoreBridge.approveWrite(token)` Foundry GM console function: validates the approval token with the backend, executes the journal page update, logs a before/after audit to the console, and returns `{ success, journalId, pageId, pageName }`.
- **Enable AI-Proposed Writes** world setting (default off): gates all write operations. `approveWrite` throws immediately if this setting is disabled.
- Write tokens are single-use and expire after 5 minutes; expired or reused tokens are rejected with a descriptive error.
- **Claude (Anthropic)** added to the Remote AI Provider dropdown in Foundry world settings. The backend already supported `ANTHROPIC_API_KEY`; this surfaces the selection in the UI.

## [0.5.0] - 2026-07-31

### Added

- `search_items` MCP tool: keyword search across world items by name and description, with optional type and visibility-mode filtering.
- `get_actor_inventory` MCP tool: list all items carried by a named actor with system-agnostic quantity, weight, price, rarity, identified, and description fields.
- `search_session_logs` MCP tool: keyword search across pages of the GM-designated session log journal, with session-number extraction and excerpt support.
- `get_session_log` MCP tool: retrieve the full plain-text content of one session log page by journal and page ID.
- `list_compendiums` MCP tool: list all compendium packs available in the world with document type and entry count; respects the new Excluded Compendiums setting.
- `search_compendium` MCP tool: search compendium pack indexes by entry name without importing documents; supports filtering by pack ID or document type.
- `get_compendium_entry` MCP tool: retrieve a specific compendium index entry by pack ID and entry ID, returning its UUID, name, type, and image.
- **Session Log Journal** world setting: name of the journal that holds session log pages (default `Session Logs`).
- **Excluded Compendiums** world setting: comma-separated pack IDs hidden from LoreBridge compendium tools.
- `LoreBridge.searchItems`, `LoreBridge.getActorInventory`, `LoreBridge.searchSessionLogs`, `LoreBridge.getSessionLog`, `LoreBridge.listCompendiums`, `LoreBridge.searchCompendium`, and `LoreBridge.getCompendiumEntry` exposed on the Foundry GM console API.

## [0.4.0] - 2026-07-31

### Added

- Optional backend AI-provider configuration via environment variables (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`). Anthropic is preferred when both are set. Credentials are never stored in Foundry settings or returned by any API.
- `GET /v1/provider/status` (authenticated) returns `{ provider, enabled, healthy }` — calls the provider API to confirm the key is valid on first request and caches the result.
- `providerEnabled` field added to the `GET /v1` discovery response.
- `POST /v1/generate/boxed-text` (authenticated) accepts a bounded content payload (up to 4000 characters) from a selected journal page or scene and returns AI-generated read-aloud boxed text with tone, length, and audience controls. No Foundry document is modified.
- `LoreBridge.generateBoxedText({ content, documentName, documentType, sourceId, sourceName, tone?, length?, audience? })` exposed on the Foundry GM console API.
- Tone options: `gothic`, `neutral`, `heroic`, `mysterious`. Length options: `short`, `medium`, `long`. Audience options: `players`, `gm`.
- Anthropic backend uses `claude-haiku-4-5-20251001`; OpenAI backend uses `gpt-4o-mini`.

## [0.3.0] - 2026-07-31

### Added

- `get_related_documents` MCP tool: starting from any Foundry UUID, returns directly related actors, journals, journal pages, and scenes one hop away by following `@UUID` links in content, scene-linked journals, map-note pins, and placed actor tokens.
- Player-safe visibility mode (`mode: "gm" | "player"`) added to all search and retrieval MCP tools: `search_journals`, `get_journal_page`, `search_actors`, `get_actor`, `search_scenes`, `get_scene`, `search_campaign`, and `get_related_documents`.
- In player mode, search results are filtered to documents with Foundry OBSERVER or higher world-level ownership; `hiddenCount` reports how many documents were excluded.
- In player mode, focused retrieval (`get_journal_page`, `get_actor`, `get_scene`) returns `NOT_FOUND` for GM-only documents without revealing that they exist.
- `hiddenCount` field added as a required field on all search outputs (`SearchJournalsOutput`, `SearchActorsOutput`, `SearchScenesOutput`, `SearchCampaignOutput`).

## [0.2.0] - 2026-07-30

### Added

- An authenticated WebSocket session between a paired Foundry GM client and the LoreBridge backend.
- Live adapter registration for the active Foundry world and its read-only capabilities.
- Authenticated live `getWorldSummary` routing from the backend through the connected Foundry adapter.
- Authenticated live `searchJournals` routing with bounded, validated search input and output.
- Authenticated live `getJournalPage` routing for focused retrieval from the connected Foundry world.
- An authenticated Streamable HTTP MCP endpoint with a read-only `get_world_summary` tool.
- A read-only MCP `search_journals` tool backed by the connected Foundry world.
- A focused, read-only MCP `get_journal_page` tool for retrieving journal content selected from search results.
- Shared, Foundry, backend HTTP, and MCP support for bounded actor search and focused actor retrieval.
- Actor results include stable Foundry IDs and UUIDs while excluding raw system data and embedded documents.
- Shared, Foundry, backend HTTP, and MCP support for bounded scene search and focused scene retrieval.
- Scene results include the active and navigation flags alongside stable Foundry IDs and UUIDs.
- Active-scene context via `get_active_scene`, which returns the currently viewed scene for GM location questions.
- Every capability result now includes a `sourceId` and `sourceName` so Codex can cite the Foundry world behind each answer.
- Matched journal pages now include a `matchedPageUuid` field for direct UUID-based retrieval.
- Shared, Foundry, backend HTTP, and MCP support for `resolve_uuid`, resolving a Foundry UUID to a fully normalized actor, journal, journal page, or scene document.
- Shared, Foundry, backend HTTP, and MCP support for `search_campaign`, a unified cross-type search that ranks actors, journals, and scenes together when the document type is unknown.
- `search_campaign` accepts an optional `types` filter and a `limit`, merges sub-search results, and ranks by match quality then document-type priority.
- Developer workflow documentation: `CLAUDE.md`, `AGENTS.md`, and `docs/DEVELOPMENT_WORKFLOW.md` capturing the vertical-slice process, branching conventions, and validation steps.

### Changed

- Remote integration no longer requires selecting an AI provider; LoreBridge remains client- and provider-neutral.

### Fixed

- Removed a Windows-generated dependency lockfile that prevented npm from installing esbuild's Linux binary on Ubuntu.
- Preserved configured reverse-proxy path prefixes for backend health, identity, and pairing requests.
- Scene background image now uses the Foundry v14 Level API (`scene.background.src`) instead of the removed `scene.img` property.

### Security

- MCP requests require a valid LoreBridge pairing token before protocol handling.

## [0.1.6] - 2026-07-29

### Added

- Shared, Foundry, and backend support for focused `getJournalPage` retrieval.
- An authenticated journal-page API route that returns one page and its parent journal reference.

## [0.1.5] - 2026-07-29

### Added

- Shared `searchJournals` and `getJournal` capability contracts and validators.
- GM-only Foundry v14 journal search and normalized journal retrieval.
- Authenticated backend journal HTTP routes backed by an injected journal service.
- Shared, Foundry-adapter, and backend API tests for the journal vertical slice.

## [0.1.4] - 2026-07-26

### Added

- GM/world-scoped Foundry settings for capability exposure, remote integration, provider selection, and backend URL.
- Runtime policy tests covering GM-only and disabled capability API behavior.
- Provider configuration security guidance that keeps provider secrets out of the Foundry browser.

### Changed

- The LoreBridge browser API now respects the world-level capability enable toggle.
- Remote AI configuration is provider-neutral and reports incomplete configuration without opening a connection.

### Security

- OpenAI and other provider API keys are explicitly excluded from Foundry settings and bundled client code.

## [0.1.3] - 2026-07-26

### Fixed

- The browser API now reads the installed module version from Foundry instead of using a hardcoded release number.

## [0.1.2] - 2026-07-26

### Added

- Automated Foundry-adapter tests for GM access, non-GM rejection, and unavailable runtime state.
- Browser-console documentation for the temporary LoreBridge development API.
- Structured capability errors with LoreBridge protocol error codes.
- Official Foundry manifest links for the license, readme, issue tracker, and changelog.

### Changed

- `getWorldSummary` now validates its normalized result against the shared runtime schema before returning it.
- Initialization logging now identifies both the Foundry module version and LoreBridge protocol version.

### Fixed

- Non-GM calls no longer throw an unstructured generic error.
- Unavailable or incomplete Foundry runtime state now produces a retryable adapter error.

### Security

- Non-GM users are rejected before campaign summary data is assembled or returned.

## [0.1.1] - 2026-07-26

### Added

- Browser-safe Foundry module bundling with esbuild.
- Automated Foundry packaging and GitHub Release workflow.
- Stable Foundry manifest URL for installation and update checks.

### Fixed

- Bundled shared LoreBridge contracts so Foundry no longer receives unresolved `@lorebridge/shared` browser imports.

## [0.1.0] - 2026-07-26

### Added

- Initial Foundry v14 module foundation.
- GM-only `getWorldSummary` capability.
- Shared LoreBridge protocol v0.1 contracts and validation.
