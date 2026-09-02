# Changelog

All notable changes to LoreBridge are documented here.

## [Unreleased]

### Added

- **Class and Subclass item types for generate_item/create_item/update_item** (#353): extends the three item MCP tools to support Class and Subclass item types. `buildClass()` creates the Foundry class document with: `HitPointsAdvancement` covering all 20 levels, `TraitAdvancement` entries for armor, weapon, tool, and skill proficiencies, and `AbilityScoreImprovementAdvancement` at levels 4/8/12/16/19; all class feature descriptions are rendered as level-sorted HTML in the item description. `buildSubclass()` creates the Foundry subclass document with a `classIdentifier` linking to the parent class, subclass feature descriptions as HTML, and spellcasting fields for subclasses that grant casting. The AI generation prompt is extended to produce `classIdentifier`, `hitDie`, `savingThrows`, `skillChoices`/`numSkillChoices`, armor/weapon/tool proficiencies, `spellcastingProgression`/`spellcastingAbility`, and a `classFeatures` array covering all 20 levels; the token limit is raised to 2500 for these types. `create_item` and `update_item` route class/subclass through the existing SSE approval flow unchanged with no new MCP tool surface.

- **generate_encounter, create_encounter, update_scene MCP tools** (#349): three new tools for external encounter building and scene editing without opening the Foundry UI. `generate_encounter` (read-only) produces a full encounter preview from a natural-language prompt — combatants with quantities, initiative modifiers, zone placement hints, disposition, XP budget, difficulty rating (Easy/Medium/Hard/Deadly), hook text, and tactical notes — given party level/size, environment, difficulty target, and optional scene context. `create_encounter` (write) takes that preview and, through a single GM approval dialog, resolves actors (showing ✓ found / ✗ not found per combatant, blocking Approve for missing actors), places tokens on the scene using zone-to-canvas mapping with cluster offsets, registers them as combatants, and optionally auto-rolls initiative and starts round 1 (`startCombat: true`). `update_scene` (write) generates a JSON diff for supported scene fields (name, navName, navigation visibility, grid type/size/units, fog exploration, global illumination, environment description) and presents it in a DialogV2 preview before applying `scene.update()`. All three tools route through the standard GM approval flow and are gated behind the write-enable setting.

- **Background, Race/Species, and Container item types for generate_item/create_item/update_item** (#352): extends the three item MCP tools to support three additional D&D 5e item types. Background generation produces 2 skill proficiencies, tool proficiencies, languages, and a named feature (rendered as HTML in the item description), with `TraitAdvancement` entries for proficiencies and an `AbilityScoreImprovementAdvancement` for D&D 2024 modern edition. Race/Species generation populates `system.movement`, `system.senses`, and `system.size`, adds `TraitAdvancement` entries for damage resistances, and renders racial trait descriptions as HTML sections; ASI handling is edition-aware (fixed values in 2014 legacy, omitted in 2024 modern where ASI moved to Background). Container generation sets `system.capacity` (weight-based for bags, quantity-based for quivers/arrows) and initialises empty `system.currency` slots with a `weightlessContents` flag for bags of holding. All three types route through the existing `generate_item`, `create_item`, and `update_item` tools with no new MCP tool surface.

- **generate_item, create_item, update_item MCP tools** (#348): three new tools for external item creation and editing across 7 D&D 5e item types (weapon, spell, feat, consumable, equipment, loot, tool). `generate_item` produces a complete stat block from a natural-language prompt with an `edition` parameter (`"legacy"` for D&D 2014 flat-field layout, `"modern"` for D&D 2024 activities system). `create_item` routes through the GM approval dialog and calls `Item.create()` on approval, with an optional `actorId` to place the item directly in an actor's inventory. `update_item` re-generates targeted field changes from an instruction string and routes through the same approval flow before calling `item.update()`. `description.chat` is set only when the description exceeds 200 characters, condensing it to the first sentence for a cleaner chat card. All three tools follow the standard GM preview-and-approval flow and are gated behind the existing write-enable setting.

- **generate_npc, create_actor, update_actor MCP tools** (#347): three new tools for external NPC creation and editing without opening the Foundry UI. `generate_npc` produces a complete 5e stat block (ability scores, AC, HP, speed, skills, traits, actions) from a natural-language description via the configured AI provider. `create_actor` writes a new actor document to the Foundry world using the stat block data — accepts folderId for placement. `update_actor` patches an existing actor by UUID, allowing targeted field edits (name, HP, abilities, items, biography, etc.). All three follow the standard GM preview-and-approval flow used by existing generation tools.

- **excludeFolderIds exclusion filter for all MCP search tools** (#343): `search_journals`, `search_actors`, `search_scenes`, `search_items`, `search_roll_tables`, `list_macro_tools`, and `list_macros` now accept an optional `excludeFolderIds` array; documents whose folder ID appears in that list are omitted from results. `search_campaign` gains both `folderId` (include) and `excludeFolderIds` (exclude) — the only tool that previously had neither. Exclusion uses an O(1) Set lookup and takes priority when a folder ID appears in both the include and exclude filters.

## [0.31.2] - 2026-08-21

### Fixed

- **Scene controls button (Session Command Center)** (#344): the LoreBridge bridge icon was missing from the scene controls bar after a Foundry v14 update changed the controls HTML structure from `<ol class="main-controls">` to `<menu data-application-part="layers">` and switched from Font Awesome 5 `<i>` icon tags to Font Awesome 6 classes on the button element itself. The injection logic now targets the `<menu>` element first and uses the correct button class pattern, with a `ready`-hook fallback so the button recovers even if the `renderApplicationV2` hook fires before the module is ready.

## [0.31.1] - 2026-08-20

### Added

- **Folder-aware campaign search** (#325): `search_journals`, `search_actors`, `search_scenes`, and `search_items` now return `folderId` and `folderName` and accept an optional `folderId` filter without changing unfiltered behavior.
- **Journal-scoped search** (#324): `search_journals` accepts an optional native or UUID-format `journalId`, which can be combined with `folderId` to search one journal within one folder.
- **Folder-aware macro-tool discovery** (#328): `list_macro_tools` returns macro folder context and accepts an optional `folderId` filter while continuing to expose only explicitly configured tools.
- **World macro inventory** (#333): new read-only `list_macros` tool lists every world script macro with folder context and an `isCallable` flag; arbitrary macro execution remains unavailable.
- **Roll-table search** (#326): new read-only `search_roll_tables` tool searches world roll tables by name or description with folder, visibility, and result-limit filters.
- **MCP playlist retrieval** (#327): new read-only `list_playlists` and `search_playlists` tools expose playlist names, folder context, current playback state, and track counts while respecting GM/player visibility mode. Playlist playback controls remain out of scope.

## [0.30.0] - 2026-08-19

### Fixed

- **Material Deck compatibility** (#320): the LoreBridge scene control button no longer registers itself via `getSceneControlButtons`, which caused Material Deck to crash during initialization. The button is now injected directly into the DOM after the SceneControls application renders. The bridge icon and Session Command Center remain fully functional.

## [0.29.0] - 2026-08-18

### Added

- **GitHub Backups: configurable folder paths** (#305): new **Backup Config** section in LoreBridge Settings exposes configurable GitHub destination paths for each backup category — NPC actors, player actors, journals, macros, and session logs. Paths are set once and used by every backup button.
- **GitHub Backups: per-category backup buttons** (#306, #307): the Session Command Center's new **GitHub Backups** section has dedicated buttons for each content category — NPCs, Players, Journals, Macros, and Session Logs. Each runs independently; no automatic backup fires without a button press.
- **NPC Actor backup** (#307): **Backup NPCs** exports all NPC actors as Markdown files. A scrollable folder-selection dialog appears first, with all folders checked by default and Select All / Select None shortcuts. Selecting a folder automatically includes all descendant subfolders (recursive expansion). The full Foundry folder hierarchy is preserved in GitHub paths (e.g. `04-world/Barovia/Strahd.md`).
- **Player Actor backup** (#307): **Backup Players** exports all player character actors using the same folder-picker and recursive-expansion workflow as NPC backup.
- **Journal backup** (#307): **Backup Journals** exports non-CC, non-session-log journals as Markdown. CC-managed journals and the Session Logs journal are excluded. Full folder hierarchy is preserved in GitHub paths.
- **Macro backup** (#307): **Backup Macros** exports all world macros as `.js` files (matching their actual format) with a header comment block containing macro name, type, and scope.
- **Session Log backup** (#307): **Backup Session Logs** exports all session log pages as Markdown files.
- **Progress dialog for all backup operations** (#317): every backup button now opens a live-updating progress dialog showing file count, chunk progress, and current status label. Operations no longer run silently in the background.
- **Folder picker for actor and journal backups** (#317): before starting, NPC, player, and journal backups open a scrollable folder-selection dialog. All folders are checked by default; Select All / Select None shortcuts are available. Cancelling aborts with no network activity.
- **Recursive folder expansion** (#317): selecting a parent folder in the picker automatically includes all descendant subfolders, so selecting the top-level folder captures the entire tree.
- **Full folder hierarchy in GitHub paths** (#317): backed-up files are placed under the complete Foundry folder path rather than flat in the configured root.
- **CC Export configurable paths** (#308): the **Export CC** button now uses the same path configuration infrastructure as the other backup categories.

### Fixed

- **Backup repoRoot path resolution** (#317): files backed up with an empty `repoRoot` (to write directly to the repo root rather than under the `campaign/` prefix) now resolve to the correct path. The backend no longer prepended `GITHUB_CAMPAIGN_ROOT` when `repoRoot` was empty, causing files to land at `campaign/04-world/…` instead of `04-world/…`.

### Removed

- **Deprecated backup infrastructure** (#309): the old tracker-column backup buttons, the unified "Backup All" tracker action, and the associated deprecated capability files have been removed. All backup operations now use the new per-category workflow in the GitHub Backups section of the Session Command Center.

## [0.28.1] - 2026-08-16

### Added

- **CC Journal Export — section picker** (#301): clicking **Export CC** now opens a folder-selection dialog before uploading. Every Campaign Codex root folder and a Session Logs row are listed with checkboxes, all checked by default. The GM unchecks sections they don't need and clicks Export; only selected sections are uploaded and deletion sync is scoped to those prefixes so unselected folders are left untouched on GitHub. Cancelling aborts with no network activity.

## [0.28.0] - 2026-08-16

### Added

- **CC Journal Export — full structured content** (#298): the **Export CC** button now writes the real Campaign Codex data to GitHub instead of stub page HTML. NPC journals render a full markdown dossier (Reference, Identity, Overview, Roleplay, Knowledge sections) sourced from `flags.lorebridge.npcDossier`. Quest journals render status/urgency/visibility flags, a Quest Links section (Quest Giver, Depends On, Unlocks, Related — all resolved to human-readable names), nested `[x]`/`[ ]`/`[!]` objectives, Description, and Notes. All other CC journal types and non-CC journals fall back to page text content.
- **CC Journal Export — deletion sync** (#298): before each export run, LoreBridge fetches the current file list from GitHub and computes which paths no longer exist in Foundry. Deleted journals are removed from GitHub in a final cleanup commit. The result dialog shows the deletion count alongside the per-folder file totals.
- **Session log formatting** (#298): session log pages now export with full markdown structure — headings, paragraphs, bullet lists, bold/italic, and links — instead of all content collapsed to a single line. Powered by a new `htmlToMarkdown()` utility that walks the DOM tree element by element.

### Changed

- **Utility consolidation** (#295): `plainText`, `escHtml`, `buildBackendUrl`, and `postBackend` are now exported from single canonical locations (`utils/html.ts` and `capabilities/tracker-shared.ts`). All fourteen files that previously defined local copies have been updated to import from those sources. Net reduction of ~184 lines of duplicated code.

### Fixed

- **CC Journal Export — quest link UUID resolution** (#298): Campaign Codex stores quest `unlocks` and `dependencies` as `JournalEntry.id::pageId` references. The page sub-ID suffix caused `fromUuidSync` to return the page object rather than the journal entry, so names appeared as raw IDs. The resolver now strips the `::pageId` suffix before lookup, with a `game.journal.get()` fallback for bare short IDs.

### Removed

- **Dead code cleanup** (#294): `configuration-app.ts`, `feature-settings-app.ts`, and `dossier-normalization.ts` were unused code paths left over from an earlier implementation. Removed without replacement; no user-visible behavior changed.

## [0.27.0] - 2026-08-15

### Added

- **NPC Status Tracker** (#270): reads session logs via AI extraction and updates `npc_status.json` with per-NPC alive/dead/ghost/undead state. Tracker runs against any session range and presents a GM confirmation dialog before writing; existing entries are preserved and only changed states are updated.
- **NPC Encounter Tracker** (#271): reads session logs and updates `encountered_npcs.json` with every NPC the party has met. New names are appended; no existing entries are removed.
- **Quest Status Tracker** (#272): reads session logs and updates `quest_status_summary.json` with per-quest status (`available`, `in_progress`, `completed`, `failed`) sourced from AI extraction of session log content. Existing entries are updated in place; status is never regressed by a later tracker run.
- **Region Visit Tracker** (#273): reads session logs and updates `region_visits.json` with per-region visit state (`visited`, `sessions`, `firstSeen`). New regions are appended; existing visit state is never cleared.
- **Player Permissions Sync** (#274): bulk sets Foundry Observer permission (`ownership.default = 2`) on all Campaign Codex journals matching entries in the three tracker files. NPCs and regions always sync; quests with `available` status are excluded. Missing-journal names are reported without failing the sync.
- **Portrait Auto-Match** (#276): scans `Data/portraits/` (configurable) and sets the portrait field on each matched Campaign Codex NPC journal using fuzzy name matching. A preview dialog shows exact and close matches before any changes are applied; unmatched entries are listed for GM review.
- **Post-Session Checklist** (#277): one-click Session Command Center button that runs all four tracker analyses (NPC Status, Encounters, Quest Status, Region Visits), Permissions Sync, and GitHub Backup All in sequence, showing a per-step progress and result summary in a single dialog.
- **GitHub Backup All** (#278): backs up all LoreBridge tracker JSON files and every Foundry macro to the configured GitHub campaign repository in a single authenticated commit. File paths follow the `campaign/<lorefolderPath>/<filename>` convention.
- **CC Baseline** (#286): new **CC Baseline** button in the Session Command Center reads all journals from the four Campaign Codex folders (NPCs, Locations, Quests, Regions), commits `cc_baseline.json` to GitHub as a versioned snapshot, and pre-populates empty tracker JSONs so session trackers start from the known CC state without requiring a full AI Initialize pass.
- **Session Log Creator** (#288): new **Add Session** button in the Session Command Center and on the Session Logs journal header shows a dialog pre-filled with the next session number (auto-detected from existing log pages) and today's date. Confirming creates a new journal page in the Session Logs journal with the standard structured HTML template (Region/Locations/NPCs/Quests header, story sections, End of Session footer) and opens the journal to the new page.
- **CC Journal Export** (#291): new **Export CC** button in the Session Command Center exports every journal inside all "Campaign Codex - *" folder trees (Factions, Groups, Locations, NPCs, Quests, Regions, Entries) plus each page of the Session Logs journal to GitHub under `sources/campaign codex/<folder>/<subfolders>/<name>.md`. Subfolder structure is preserved (e.g. Quests/Available/, Quests/Completed/). Files are committed in chunked batches of 25 with per-chunk progress notifications to avoid proxy timeouts and GitHub secondary rate limits. A results dialog shows the per-folder file count and a link to the last commit.

### Fixed

- **Permissions Sync NPC type mismatch**: `permissions-sync.ts` previously read `encountered_npcs.json` as `NamedEntry[]` and called `.name` on each entry, producing `undefined` for every NPC because the file stores plain `string[]`. Changed type to `string[]` and used the array directly.

## [0.26.4] - 2026-08-13

### Added

- **Session Log Reader unified API** (#269): new `session-log-reader.ts` module exposes `readAll()`, `readLatest()`, `readSince(n)`, and `readPage(n)` — each returns `{ sessionNumber, date?, content, pageId, pageName }` sourced from the journal named by the existing `lorebridge.sessionLogFolder` setting. The journal name match is case-insensitive and gracefully throws a typed `LoreBridgeCapabilityError` if the journal is not found.
- **AI extraction from session logs** (#269): `extractFromSession(content, prompt, pageId)` sends session text to the backend `POST /v1/generate/extract` endpoint with a caller-supplied prompt; results are cached per `pageId+prompt` key so repeated calls for the same page are served from memory without re-calling the AI provider.
- **Backend extract endpoint** (#269): `POST /v1/generate/extract { content, prompt }` → `{ result }` — authenticated with the pairing token, provider-gated (returns 503 when no provider is configured), wraps the existing `callAI` infrastructure with a session-aware system prompt. Content is capped at 40,000 characters.
- **Name-matching utility** (#269): `src/utils/name-matching.ts` exports `normalizeName(name)` (lowercase, strip leading titles, convert hyphens to spaces, strip punctuation) and `matchName(candidate, targets[], threshold?)` (returns best match above threshold, default score ≥ 50). Scoring: 100 exact, 90 candidate-starts-with-target, 85 target-starts-with-candidate, 70 candidate-contains-target, 50 all target words present, 40 first+last word present. Title prefixes stripped: `sir`, `lady`, `baron`, `baroness`, `father`, `mother`, `lord`, `king`, `queen`, `the`, `mad`, `ghost of`, `spirit of`, `brother`, `sister`.
- **LoreBridge Data Folder setting** (#269): new `lorebridge.lorefolderPath` world setting (default `"lorebridge"`) for the subfolder where LoreBridge writes tracking files. Configurable in the **Advanced** section of the LoreBridge Settings workspace.

## [0.26.3] - 2026-08-13

### Added

- **NPC Dossier: Killed By and Session # fields** (#275): the Info tab now includes two new fields — **Killed By** (text) and **Session #** (number) — that appear only when the NPC's status is a terminal state (Dead, Ghost (At Rest), or Undead (Destroyed)). In edit mode the Circumstances section shows and hides dynamically when the Status select is changed. In read view a **Circumstances** section appears below the Status bar when either field has a value. Both fields are included in the AI context summary for terminal-status NPCs. Schema version bumped from 1 to 2; existing dossiers load with empty defaults and no data migration is required.

## [0.26.2] - 2026-08-13

### Added

- **Global NPC tab visibility defaults** (#279): LoreBridge Settings → Features now includes an **NPC Tab Defaults** table with rows for Profile, Roleplaying, and Knowledge. Each row has two toggles — **Visible by Default** (whether the tab appears at all) and **Player Hidden** (whether the tab is restricted to GMs only). Default state is Visible ✓, Player Hidden ✓ for all three tabs. Saving the Features section writes these defaults directly to Campaign Codex's `tab-overrides` flag on every world NPC journal so that CC's own Configure Tabs dialog reflects the correct Enabled/Hidden state and CC natively enforces player visibility. No Foundry reload is required — open sheets re-render from the updated flag. Per-sheet overrides set in CC's Configure Tabs still apply and take effect immediately after a save.

### Fixed

- **Roleplaying dossier Characterization layout**: the four Characterization fields now display as a 2 × 2 grid (Personality + Motivation on the first row, Fear + Mannerisms on the second) instead of a cramped single row of four columns.

## [0.26.1] - 2026-08-13

### Changed

- **NPC Dossier Status: expanded options** (#266): the Status field now offers seven options — Alive 💚, Dead ☠️, Ghost (Active) 👻, Ghost (At Rest) 🕯️, Undead (Active) 🧟, Undead (Destroyed) 💀, and Unknown ❓. Each state has a distinct left-border colour and emoji in the read view. The edit form dropdown shows emoji prefixes on all options. Existing dossiers with the previous three values are unaffected; any unrecognised stored value continues to default to Alive.

## [0.26.0] - 2026-08-13

### Added

- **NPC Dossier: Status field** (#266): the Info tab of the LoreBridge NPC Dossier widget now includes a **Status** field (`Alive` / `Dead` / `Unknown`, default `Alive`). In the read view a colour-coded left-border bar appears beneath the Nickname bar — 💚 green for Alive, ☠️ red for Dead, ❓ gray for Unknown. In the edit form a select dropdown is placed beneath the Known As / Nickname field. Status is included in both the widget summary text and the backend AI context so generation and roleplay calls reflect NPC mortality. Existing dossiers default to `Alive` transparently with no data migration required.

## [0.25.1] - 2026-08-11

### Changed

- **Spotlight Omnisearch is now optional**: the `spotlight-omnisearch` module dependency has been moved from `requires` to `optional` in `module.json`. LoreBridge already fell back gracefully to native Foundry search and bounded scanners when Spotlight was unavailable; this corrects the manifest to reflect actual runtime behavior. Installing Spotlight Omnisearch 4.0.2+ is still recommended for improved candidate search quality, but LoreBridge operates fully without it.

## [0.25.0] - 2026-08-11

### Added

- **AI NPC in Create Actor dialog** (#110, #228–232): a native **AI NPC** radio-button entry is injected into Foundry's Create Actor type list (matching the style of Encounter, Group, NPC, PC, Vehicle). Selecting it and clicking Create Actor opens **LoreBridge — Generate NPC** where the GM describes the creature, sets CR, tone, and rules edition, then generates a full D&D 5e stat block with items. The preview dialog shows the complete stat block and the **Create Actor** button places it in a "LoreBridge NPCs" folder.
- **Player Party in Create Actor dialog** (#230): a native **Player Party** radio-button entry in the same Create Actor list opens **LoreBridge — Create Player Party** — the GM enters one player name per line (optional `+N` for extra actors), selects a folder name and password strength, and confirms with **Create Party**. LoreBridge creates linked Foundry User and Actor pairs and presents a copyable credential table.
- **Distribute Hotbar to Players in Macros sidebar** (#231): a **Distribute Hotbar to Players** button is injected at the bottom of the Macros sidebar footer, visible to GMs at all times alongside their macros. Opens a page-selector; the GM picks hotbar pages (1–5) to broadcast. Connected players overwrite only the selected pages; disconnected players are not affected.
- **Remove All Players in Session Command Center** (#232): a **Remove All Players…** Quick Actions button in the Session Command Center opens a confirmation dialog listing every Player and Trusted account before deletion. GM (role 4) and Assistant GM (role 3) accounts are never affected.
- **Import from Backup in actor sheet header** (#228): non-GM players with OWNER permission on a character actor see **Import from Backup** in the actor sheet ⋮ header menu. Two authenticated backend endpoints list and retrieve character-type actor sidecars from the GitHub backup. NPC actors are never exposed; the import never changes the actor's Foundry `_id`.

### Fixed

- **NPC actor creation size key** (#110): `buildDnd5eActorData` was computing dnd5e size keys with a `slice(0, 3)` heuristic that produced invalid values for every size other than Medium (`"lar"` for Large, `"tin"` for Tiny, `"hug"` for Huge). `CONFIG.DND5E.actorSizes` returned `undefined` for those keys, and dnd5e then crashed reading `.token` off it. Replaced with an explicit lookup table mapping full size words to the correct dnd5e keys (`tiny / sm / med / lg / huge / grg`).

## [0.24.0] - 2026-08-11

### Added

- **Campaign Codex NPC Dossier widget** (#258): optional integration that registers four structured Campaign Codex widgets on every NPC journal — **LB: NPC Info**, **LB: NPC Profile**, **LB: NPC Roleplaying**, and **LB: NPC Knowledge**. All four widgets share a single `lorebridge.npcDossier` flag so editing any section updates the same data object.
  - **LB: NPC Info** — source book and page, stat block reference, discovery region and location, and full identity/appearance fields (race, alignment, sex, age, height, weight, eyes, hair, occupation).
  - **LB: NPC Profile** — player knowledge summary, profile tagline, overview bullets, relationship entries, and a repeatable **GM Secrets** list. Each secret entry has a heading and body text and renders inside a native Foundry `<section class="secret">` block (gold border, Reveal button, invisible to players).
  - **LB: NPC Roleplaying** — first impression, personality, motivation, fear, mannerisms, voice/speech, conversational approach, at-the-table guidance, and repeatable goal entries.
  - **LB: NPC Knowledge** — conditional information (trigger → response → consequence), Q&A entries with normal/conditional/secret visibility, general knowledge statements with topic and quality, and knowledge limits. Trigger, question, and topic labels render as block-level uppercase headings for quick scanning during play.
  - Widgets are **auto-added** to all existing NPC journals 2 seconds after startup and to new NPC journals within 500 ms of creation, with deduplication.
  - LoreBridge generation and roleplay context prefer dossier data when present and fall back cleanly when Campaign Codex is absent.
- **Campaign Codex NPC Dossier settings toggle** (#258): a new **Campaign Codex NPC Dossier** toggle in LoreBridge Settings → Features controls whether the integration is active (default: enabled). Disabling it skips widget registration and auto-add entirely. Dossier data stored in flags is preserved when the feature is disabled and fully restored when re-enabled. Changing the toggle triggers a reload dialog. Users without Campaign Codex can leave the toggle off with no side effects.

### Notes

- Campaign Codex is an optional dependency. LoreBridge loads and operates normally when Campaign Codex is absent or disabled.
- A follow-on data migration macro (#260) to export dossier content to plain journal pages is tracked as deferred work.

## [0.23.0] - 2026-08-10

### Added

- **NPC persistent memory engine** (#198): every `@NPC` chat exchange that produces an AI response is automatically saved as a persistent memory entry on the actor (`lorebridge.memories` flag). Memories survive page reloads and sessions. Recent memories (up to 20) are injected into the roleplay system prompt so the NPC can reference prior conversations in future interactions — making recurring NPC encounters richer and more coherent across sessions.
  - Each memory entry records a timestamp, player name, player message, and NPC response.
  - Entries are capped at 50 per NPC; oldest entries are pruned automatically when the cap is reached.
  - A **Memories** section in the NPC biography panel (the inline LoreBridge panel on the actor sheet) shows accumulated entries in reverse-chronological order with per-entry delete and a Clear All button.
  - A **Memories** nav item in the NPC Workspace window shows the same management UI with an entry count in the sidebar.
- **NPC Workspace: D&D 5e background field and trait table picker** (#207): the Overview section of the NPC profile now includes a Background field with a dropdown of the 13 SRD standard backgrounds plus a custom free-text option. A **Roll Traits** button in the Personality & Motivation section (panel and workspace) randomly selects a personality trait, ideal, bond, and flaw from the SRD trait tables for the NPC's background and pre-populates the edit form. Generated background values are synced to the native `system.details.background` dnd5e actor field.

## [0.22.0] - 2026-08-10

### Added

- **Context Profile: folder-level scoping** (#185): profiles now accept a `scopedFolders` map that restricts each document type to selected Foundry folders. Only documents inside a scoped folder (or any of its descendants) pass the profile filter; documents outside the scope are excluded regardless of other profile settings. Folder selection uses a checkbox tree in the create/edit dialog.
- **Context Profile: profile preview** (#186): a Preview button in the context profiles list opens a read-only summary of exactly which documents the active profile would include — document type, folder scope, visibility mode, compendium exclusions, and a live count of matched sources — so a GM can verify the boundary before activating it.
- **Context Profile: source recheck at request time** (#187): at the moment a scoped profile is applied to a request, LoreBridge rechecks every previously resolved source against current Foundry state. Documents that have been moved, deleted, or permission-restricted since the profile was created are silently excluded rather than carried forward stale.
- **Unified LoreBridge Settings workspace** (#251): the five separate Game Settings menus (Connection, Features, AI & Content, Access & Safety, Generation History) are replaced by a single resizable `LoreBridgeSettingsApp` ApplicationV2 workspace. A left navigation rail with seven sections (Home, Connection, Features, AI & Content, Access & Safety, History, Advanced) provides a coherent overview of all configuration options. Feature and Advanced toggles use sliding CSS toggle switches. All settings remain `config: false` so they appear only in the LoreBridge workspace.

### Improved

- **Context Profile folder scoping is enforced across all retrieval tools** (#185): `search_journals`, `search_actors`, `search_scenes`, `search_items`, `get_related_documents`, `audit_campaign_consistency`, and the active-scene toggle all respect folder scoping when a profile with `scopedFolders` is active.

## [0.21.1] - 2026-08-10

### Fixed

- **Configure Profiles dialog now opens in installed builds** (#248): `context-profiles.hbs` was omitted from the packaging script, causing the Configure Profiles button to fail silently in all v0.21.0 releases. The template is now included and the release archive verification script checks for it.

## [0.21.0] - 2026-08-09

### Added

- **Context Profile: active-scene toggle** (#183): profiles now accept an `includeActiveScene` flag. When enabled, the currently viewed scene is always included in consistency audits and related-document lookups even if `scene` is not in the profile's allowed document types. The checkbox appears in the create/edit dialog.
- **Context Profile: per-profile compendium exclusion** (#184): profiles accept an `excludedCompendiums` field — a comma-separated list of pack IDs entered in the create/edit dialog. These exclusions are merged with the global Excluded Compendiums setting for all compendium operations (`list_compendiums`, `search_compendium`, `get_compendium_entry`).
- **Context Profile: Duplicate button** (#183): a "Duplicate" button on each profile row creates an unlocked copy with all settings preserved and a ` (copy)` name suffix.

### Improved

- **Consistency auditor respects the active context profile** (#183): `audit_campaign_consistency` and `/lb audit` now apply the active profile's allowed document types, visibility mode, and document cap when gathering documents. Without an active profile, behavior is unchanged.
- **`get_related_documents` respects the active context profile** (#184): the tool intersects its result types with the profile's allowed types (profile `journal` covers both `journal` and `journalPage`), applies player-visibility mode from the profile, and caps results at the profile's `maxDocs` limit. Without an active profile, behavior is unchanged.

### Fixed

- **`get_related_documents` now resolves UUID links in HTML-format journal pages** (#246): Foundry's ProseMirror editor (the default) converts `@UUID[...]` inline links to `<a data-uuid="...">` anchor tags at save time. The previous implementation only scanned for the raw `@UUID[...]` text form and missed all links in HTML-format pages. Both forms are now extracted and deduplicated.

## [0.20.0] - 2026-08-08

### Added

- **Controlled combat-write foundation** (#172): a separate, disabled-by-default world setting enables narrowly typed combat proposals with compact GM previews, complete bounded state snapshots, short-lived single-use approval tokens, stable combat UUID targeting, fresh-state fingerprints, and bounded audit results. Changed combats, rounds, turns, rosters, and relevant initiatives are rejected before mutation.
- **GM-approved next-turn combat advance** (#173): AI clients can use `next_turn` to preview the current and expected next combatant, including round rollover, and request one explicit GM approval. LoreBridge revalidates the active combat UUID, round, turn, and complete ordered roster immediately before calling Foundry v14's `Combat.nextTurn()`, then returns the resulting round, turn, and combatant in a bounded audit result.
- **GM-approved initiative correction** (#174): AI clients can use `set_initiative` to target one combatant by stable ID, preview its old and proposed initiative plus expected position, and request one explicit GM approval. LoreBridge rejects non-finite or out-of-range values before proposal creation, revalidates the combatant and complete roster before calling Foundry v14's `Combat.setInitiative()`, and returns the resulting bounded combat order.
- **Distinctly confirmed combat ending** (#175): AI clients can use `end_combat` to preview the active encounter, scene, round, turn, and combatant count. Foundry requires a separate destructive confirmation, revalidates the complete active-combat snapshot, and calls the public `Combat.endCombat()` API without deleting combat history or chat.

### Security

- Combat writes remain GM-only, disabled by default, and unavailable to Player Lore. LoreBridge exposes no arbitrary Foundry method or JavaScript execution, and rejected, expired, reused, mismatched, or stale proposals cannot reach a mutation.

### Compatibility

- Controlled combat operations use the documented Foundry VTT v14 `Combat` APIs. The end-combat approval path allows up to 60 seconds for the GM to answer Foundry's native destructive confirmation; cancellation is recorded without ending combat.

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
