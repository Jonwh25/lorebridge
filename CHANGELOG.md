# Changelog

All notable changes to LoreBridge are documented here.

## [Unreleased]

### Added

- **GM-approved next-turn combat advance** (#173): AI clients can use `next_turn` to preview the current and expected next combatant, including round rollover, and request one explicit GM approval. LoreBridge revalidates the active combat UUID, round, turn, and complete ordered roster immediately before calling Foundry v14's `Combat.nextTurn()`, then returns the resulting round, turn, and combatant in a bounded audit result.
- **GM-approved initiative correction** (#174): AI clients can use `set_initiative` to target one combatant by stable ID, preview its old and proposed initiative plus expected position, and request one explicit GM approval. LoreBridge rejects non-finite or out-of-range values before proposal creation, revalidates the combatant and complete roster before calling Foundry v14's `Combat.setInitiative()`, and returns the resulting bounded combat order.

## [0.19.0] - 2026-08-08

### Added

- **Local-first hybrid search** (#225): LoreBridge now uses Spotlight Omnisearch 4.0.2 metadata candidates and Foundry v14 native collection search before its existing bounded content scanners. Exact and partial names, journal pages and headings, and compendium entries can be identified earlier while journal bodies, actor biographies, item descriptions, and other content continue to use LoreBridge's authoritative scanners.
- **Safe live candidate resolution**: every Spotlight candidate is reduced to a supported document type and UUID, resolved again against current Foundry state, and passed through the existing authorization, Player Lore, Context Profile, compendium exclusion, result-limit, excerpt, and source-attribution boundaries. Executable and non-document Spotlight terms are rejected and callbacks are never invoked.

### Improved

- Empty, unavailable, or rebuilding Spotlight indexes now fall back to native search and existing scanners without blocking queries. LoreBridge requests at most one non-blocking Spotlight rebuild per lifecycle.
- No-context `/lb` and Player Lore questions still return locally without an AI-provider request when no authorized source remains.

### Compatibility

- Spotlight Omnisearch 4.0.2 or newer is now a required Foundry module dependency. Dig Down remains optional and LoreBridge does not call its internals.
- When Dig Down owns file discovery, keep Spotlight file search disabled to avoid maintaining two large file indexes. LoreBridge does not change either module's settings and its existing `search_assets` capability is unchanged.

## [0.18.0] - 2026-08-08

### Added

- **GM-published Player Lore Assistant** (#170): GMs can enable a player-facing `/lb` question flow and explicitly publish selected player-visible journals through **Game Settings → Configure Player Lore**. Players can use `/lb <question>` or `/lb ask <question>` and receive source-cited answers in public Foundry chat.
- **Dual authorization on every player request**: results are restricted to the GM publication allowlist and rechecked with Foundry's effective permission API for every non-GM world user before anything is posted publicly. Disabling Player Lore, removing a journal from the allowlist, or changing Foundry ownership takes effect on the next request without rebuilding an index.
- **Private backend routing for player questions**: player requests travel over the Foundry module socket and are fulfilled by the connected GM browser. Players never receive the LoreBridge backend client token or access GM-only tools, writes, macros, or generation utilities.

### Improved

- `/lb` questions now extract meaningful search terms from conversational prompts, display the asker's name, clear the chat input after submission, and return **“The lore is silent on that particular mystery.”** without an AI-provider call when no published source matches.
- Journal-page Q&A now ranks all pages in the journal for relevance within a bounded context budget, while avoiding injection into Foundry's Ownership Configuration dialog.

### Fixed

- **Effective Player Lore permissions** (#221): publication and request handling now use Foundry v14 `JournalEntry.testUserPermission` instead of relying on default ownership. A journal denied to any non-GM user is excluded from public Player Lore answers immediately.

## [0.17.0] - 2026-08-08

### Added

- **NPC Profiles & AI Workspace** (#196, #197): every NPC actor sheet now has an embedded **LoreBridge NPC Profile** panel in the Biography tab and a full **NPC Workspace** window in the ⋮ three-dots header menu. The profile is split into 8 independent sections — Gender, Overview, Appearance, Personality & Motivation, Relationships, Secrets & Story, History, and Gameplay — each with its own generate, regenerate, edit, and copy controls. Sections generate independently using the rest of the profile as consistency context; existing sections are never overwritten unless explicitly requested. Manual editing is always available without generating first.
- **Gender section with pronoun-aware generation**: a dedicated Gender section (separate from Overview so it is never overwritten by other generation) with structured dropdowns for gender identity (Male / Female / Nonbinary / Genderfluid / Agender / Other) and presentation (Masculine / Feminine / Androgynous / Neutral / Other). The AI derives the correct pronouns from the gender field and applies them consistently across every section it generates.
- **Full-generate shortcuts**: both the inline panel and Workspace sidebar offer **Generate Full** (all 8 sections) and **Hold Gender** (all sections except Gender, preserving a manually set or previously generated gender). Per-section progress indicators show ⏳ queued → spinner active → ✅ or ❌ as each section completes.
- **Native dnd5e field sync**: saving any section automatically writes generated values back to the matching native dnd5e actor fields — alignment (Details), languages (Languages dialog), ideal / bond / flaw (Biography traits), disposition (token), and public / private biography. Fields synced to native locations are hidden from the inline panel view to avoid duplication; they remain fully visible and editable in the Workspace window.
- **Smart language sync** (#206): the languages field is parsed against all standard and rare dnd5e language names (Common, Elvish, Dwarvish, Deep Speech, Thieves' Cant, etc.) and written to the correct language checkboxes on the dnd5e actor. Any non-standard or invented language is placed in the Special field, separated by semicolons. The AI generation prompt is also constrained to produce exact dnd5e language names.
- **D&D 5e format enforcement for ideal, bond, and flaw**: the AI is prompted to generate ideals as a concept label + colon + one sentence (`"Loyalty: Once I give my word, I keep it no matter the cost."`), bonds that name a specific person, place, or object (vague bonds rejected), and flaws that are concrete enough to cause real trouble during play. Curated few-shot examples from the SRD trait tables are included in the prompt.
- **Field-level prompt hints**: generation prompts include per-field hints that prevent content overlap between high-similarity pairs — goal vs hiddenAgenda vs secret, currentProblem vs currentStatus, allies vs organizations vs employer, clothing vs equipment vs distinguishingFeatures, publicHistory vs privateHistory vs gmNotes.

## [0.16.0] - 2026-08-07

### Added

- **AI Portrait Generation** (#109): a **Generate Portrait** button (portrait icon) appears in every NPC actor sheet header (GM only). The dialog pre-fills the subject from the actor's name, gender, and race; the context from the biography Appearance section; and offers 21 art-style presets with **Semi-Realistic Fantasy** as the default. Clicking Generate sends the request to the configured image provider, shows a preview with the prompt, and lets the GM Apply (saves to Foundry and sets actor portrait + token), Regenerate (different result each time via random seed), or Discard.
- **Gender-aware portrait prompting**: the actor's gender field anchors the prompt so female NPCs reliably produce female portraits. Gender-opposite negative prompts are added automatically for Stability AI and Workers AI providers.
- **Portrait Save Directory** setting (LoreBridge module settings, world-scoped): configurable upload path relative to Foundry's Data folder; defaults to `modules/lorebridge/images`.
- **Multi-provider image backend**: a dedicated image provider layer, independent of the text AI provider, supports Stability AI (Stable Image Core / Ultra), FLUX (Black Forest Labs), Cloudflare Workers AI, Ideogram, and OpenAI DALL-E. Auto-detection order: stability → flux → workersai → ideogram → openai. Set `IMAGE_PROVIDER=<name>` to override. Provider status is exposed at `GET /v1/image-provider/status`.

- **D&D 5e NPC Stat Block Generator**: click **Generate Full Stat Block with AI** in the Create Actor dialog to describe an NPC and receive a complete mechanical stat block. Supports Modern Rules (2024) and Legacy Rules (2014) editions. The preview dialog shows all stats, traits, and actions; clicking **Create Actor** drops the NPC into a "LoreBridge NPCs" folder with all items embedded.
- **Compendium-first item population**: actions, features, and natural attacks are sourced from the dnd5e monster and equipment compendiums first (Claw, Bite, Multiattack, Legendary Resistance, etc.), with synthetic fallback only when no compendium match is found. Prefix matching handles names like "Claw (Hybrid Form Only)".
- **Edition-aware activity generation**: synthetic items for Modern edition include full dnd5e 4.x activity objects (attack with melee/ranged + weapon/spell classification, utility, save, heal). Spell-like abilities (rays, bolts, blasts) get ranged spell attack activities; melee attacks get melee weapon attack activities; saving-throw abilities get save activities.
- **Source section population**: all generated items and actors carry `system.source` with `Custom Label: "LoreBridge AI"`, `Rules Version: 2024 or 2014`, identifier, and revision, matching the Configure Source dialog fields.
- **Generation History** (#111): every AI generation (stat blocks, journal content, etc.) is saved to a world-scoped history log. The **Generation History** button in the LoreBridge panel lets GMs reopen any previous AI output without regenerating it.

## [0.15.0] - 2026-08-06

### Added

- **Session Command Center** (`⚔️` sidebar button, GM only): a live-session dashboard that opens as a floating panel from a dedicated button in the Foundry scene controls sidebar. Sections cover active scene, combat tracker, recent chat, and quick action links — all readable at a glance during play.
- **@NPC Mention — live in-character NPC dialogue**: type `@ActorName <message>` in the Foundry chat bar to address an AI-enabled NPC directly. The NPC's response appears publicly in chat, attributed to the NPC. Per-actor conversation history (up to 20 turns) is maintained in session. The feature is gated by the **Enable @NPC Mention Responses** toggle in LoreBridge Features settings (off by default).
- **Configure NPC Preamble** (actor sheet ⋮ menu, GM only): each NPC actor now has a **Configure NPC Preamble** entry in the three-dot header menu. Opens a dialog to toggle AI responses on or off per actor, write a personality preamble (overrides the biography for AI roleplay when set), and enter an ElevenLabs Voice ID for TTS. Settings are saved as actor flags and persist across sessions.
- **ElevenLabs TTS for NPC dialogue**: when an ElevenLabs Voice ID is configured on an actor and `ELEVENLABS_API_KEY` is set on the backend, AI-generated NPC responses are spoken aloud automatically after appearing in chat. The backend proxies the TTS request so the API key is never exposed to clients. Requires an ElevenLabs **Starter plan or higher** — the free tier does not permit voice API access.
- **`/lb npc` GM chat commands**: manage AI-enabled NPCs without opening any UI.

  | Command | Effect |
  |---------|--------|
  | `/lb npc enable <name>` | Enable AI responses for an actor |
  | `/lb npc disable <name>` | Disable AI responses for an actor |
  | `/lb npc preamble <name> \| <text>` | Set personality preamble via chat |
  | `/lb npc clear <name>` | Clear in-session conversation history |
  | `/lb npc list` | List all AI-enabled actors |

## [0.14.0] - 2026-08-05

### Added

- **Campaign Health and Link Checker** (`/lb health`, `/lb health full`): scans every journal page, actor, and scene for broken Foundry UUID links and empty document stubs. A resizable GM panel lists every finding with the document name, location, and issue type. Use `/lb health full` to include a deeper scan across all document types.
- **`check_campaign_health` MCP tool**: AI clients can run the same health scan programmatically, receiving a structured list of broken links, missing targets, and empty stubs with document names and UUIDs.
- **Campaign Consistency Auditor** (`/lb audit`, `/lb audit <focus>`): asks the AI to review campaign documents for internal contradictions, timeline gaps, and named-entity inconsistencies. Findings are presented in a read-only GM-only whisper with source citations so every claim is traceable to the document that contains it. Use the optional focus argument to scope the audit to a character name, location, or topic.
- **`audit_campaign_consistency` MCP tool**: AI clients can request a consistency audit directly, receiving structured findings with severity, description, and supporting source citations.
- **Context Profiles v1**: a **Configure Profiles** button in LoreBridge module settings opens a GM-only dialog for creating and managing reusable context profiles. Each profile defines which document types (journals, actors, scenes) are accessible, a visibility mode (all, player-safe, or GM-only), and an optional document cap. The active profile automatically scopes all `search_campaign` requests.
- **`/lb profile [name]`** chat command: activate a context profile by name (`/lb profile Barovia Region`), check the currently active profile (`/lb profile`), or clear it (`/lb profile off`). Result is whispered to GM users only.

## [0.13.0] - 2026-08-05

### Added

- **Batch approval queue**: a single GM panel lists every pending AI-proposed journal write. Each row shows the journal name, page, and rationale. The GM can approve or reject entries individually, select all, or select none; only one batch panel is open at a time and re-running replaces any existing one.
- **Post-session cleanup** (`/lb cleanup [session name]`): scans the current session log for new proper nouns (NPCs, locations, factions, items) that do not yet exist in the campaign. Candidates appear in a resizable review panel with per-row checkboxes; clicking **Create Stubs** creates placeholder journal pages in a "Session Cleanup" journal for every checked entry.
- **Diff-based write preview**: the write-approval dialog now shows a character-level side-by-side diff of the proposed change instead of only the new content, so the GM can see exactly what will be added, removed, or reworded before approving.
- **Rollback after approval**: the write-approval flow records the pre-approval content and exposes a **Rollback** button in the result message. Clicking it reverts the page to the version that existed before the AI wrote to it, without requiring a backup.
- **Party Recap** (`Party Recap` button on session log journals): generates a player-safe, third-person narrative recap formatted for Discord markdown. A share panel offers **Copy to Clipboard** and **Download as .md**. When GM-only entries exist in the session, an orange note counts how many were excluded from the player version.

## [0.12.0] - 2026-08-05

### Added

- **GitHub campaign repository integration**: connect a private GitHub repository as a versioned campaign backup store. Set `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, and `GITHUB_CAMPAIGN_ROOT` on the backend. All backups are committed atomically using the GitHub Git Data API; credentials never leave the backend.
- **Scene folder backup** (`/lb backup scenes <folderName>`): serializes all scenes in a named folder (and all subfolders) to Raven's Eye portable YAML. Records the full folder hierarchy, all scene properties, tokens, walls, lights, tiles, and other embedded collections. Only Scene-type folders are included; Actor, JournalEntry, and other folder types are excluded. A preview dialog shows all files before they are committed.
- **Scene folder restore** (`/lb restore scenes <folderName> [from <commitSha>]`): restores scenes from a GitHub backup commit with a GM-only preview dialog. Preserves original Foundry folder UUIDs to prevent duplicates on re-run. Detects existing scenes by flag and falls back to name matching; conflicts are surfaced and skipped. Thumbnails are regenerated after restore.
- **Journal folder backup and restore** (`/lb backup journals <folderName>`): serializes journal entries and pages to Raven's Eye markdown and YAML sidecars, with full folder hierarchy.
- **Actor and roll table backup** (`/lb backup actors <folderName>`, `/lb backup rolltables <folderName>`): serializes actors and roll tables to Raven's Eye YAML sidecars.
- **Point-in-time backup browsing** (`/lb backup commits`): lists recent GitHub backup commits with short SHA and message so GMs can select a specific restore point using `/lb restore scenes <folderName> from <sha>`.
- **Delete scene backup from GitHub** (`/lb backup delete scenes <folderName>`): permanently removes all folder YAML, scene YAML, and place markdown files for the named folder from GitHub. A confirmation dialog warns that only the GitHub backup is affected; scenes in Foundry are untouched.
- **Automatic stale folder cleanup**: each scene backup commit automatically deletes any folder YAML files in the repository that were not part of the current backup run, preventing accumulation of stale entries from previous backups.
- **Raven's Eye portable format**: all exports follow [The Raven's Eye](https://github.com/Jonwh25/the-ravens-eye) interoperability specification. Foundry-specific reconstruction data (tokens, walls, embedded collections) is stored in a versioned extension sidecar rather than the platform-independent core record.
- **`list_backup_commits` MCP tool**: AI clients can browse recent campaign backup commits.
- **`read_backup_file` MCP tool**: AI clients can read the contents of a specific file from a backup commit.

### Fixed

- Scene restore no longer creates duplicate folders when run multiple times; the original Foundry folder `_id` is stored in the backup and reused on restore.
- Scene backup no longer includes non-Scene folder types (Actor, JournalEntry, Item, RollTable) even when they share a parent ID with Scene folders.

## [0.11.0] - 2026-08-04

### Added

- **Per-category feature toggles**: a GM-only **Configure Features** settings button now groups toggles for Foundry UI buttons, `/lb` chat commands, the Journal Page Q&A panel, and AI-proposed writes. Disabled UI features disappear immediately, and disabled chat commands are ignored.
- **GM-authored Foundry macros as custom MCP tools**: GMs can expose Foundry macros as named MCP tools by adding a `@lorebridge` block to the macro description with a `name`, `description`, and optional `parameters` schema. The AI discovers them via `list_macro_tools` and calls them via `call_macro_tool`. Macro output is returned as the tool result. Macro execution requires the **Enable Macro Tools** world setting to be on.
- **Local AI provider support — Ollama**: set `OLLAMA_BASE_URL` (e.g. `http://localhost:11434`) and optionally `OLLAMA_MODEL` (default `llama3.2`) to route all generation through a local Ollama instance. No API key required.
- **Local AI provider support — OpenAI-compatible endpoints**: set `OPENAI_BASE_URL` alongside `OPENAI_API_KEY` to point the OpenAI provider at any OpenAI-compatible server (LM Studio, text-generation-webui, etc.). Set `OPENAI_MODEL` to override the default model (`gpt-4o-mini`).
- Provider priority order: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `OLLAMA_BASE_URL`.

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
