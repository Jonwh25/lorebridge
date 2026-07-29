# LoreBridge Public Capabilities

## Purpose

This document defines the first platform-neutral capabilities exposed by LoreBridge. It describes behavior, not transport. The same capability may later be invoked through MCP, HTTPS, a command-line client, or another authenticated protocol.

The first implementation is read-only.

## Common conventions

Every request will eventually include:

- protocol version
- correlation ID
- target source ID when more than one source is connected
- capability-specific input

Every successful response will eventually include:

- correlation ID
- source ID and platform type
- capability version
- capability-specific result
- truncation or pagination information when applicable

Every document returned by LoreBridge should include a stable LoreBridge reference containing:

- source ID
- platform document type
- platform document ID
- human-readable name
- optional parent or page ID

Platform-specific details belong in optional metadata and must not be required by all adapters.

## Initial capabilities

### `getWorldSummary`

Returns identity and high-level metadata for a connected campaign source.

Typical result fields:

- source name and platform
- campaign or world identifier
- campaign or world title
- game-system identity when applicable
- platform and system versions
- counts for major supported document types
- supported LoreBridge capabilities

This capability must not expose secrets, file-system paths, user credentials, or private configuration values.

### `listActors`

Returns a bounded list of actor or character summaries.

Typical result fields:

- LoreBridge document reference
- name
- actor type or category
- image reference when safe and available
- folder or organizational context
- limited system-neutral summary metadata

The default response should not return entire actor documents.

### `getActor`

Returns a detailed, normalized representation of one actor selected by stable reference.

The first version should prioritize:

- identity
- description or biography
- type
- ownership-safe metadata
- system-neutral details that are useful to a GM or campaign assistant
- source references

System-specific character data can be added through optional adapter metadata without redefining the core capability.

### `listJournals`

Returns a bounded list of journal summaries.

Typical result fields:

- LoreBridge document reference
- journal name
- page count
- folder context
- page titles when requested

Journal body content is not returned by default.

### `searchJournals`

Searches journal names, page titles, and permitted page text.

Typical inputs:

- query
- optional result limit
- optional folder or journal scope
- optional inclusion of excerpts

Typical result fields:

- journal and page references
- title
- bounded excerpt
- match context
- truncation indicator

Search must identify the exact supporting journal and page. It must not return unlimited page content.

Implemented in the Foundry adapter with:

- case-insensitive matching against journal names, page names, and text-page content
- one best match per journal
- exact-name matches ranked before partial names and page text
- a default limit of 10 and a hard maximum of 50
- page-text excerpts bounded to 240 characters
- GM-only execution

### `getJournal`

Returns one journal or selected journal page by stable reference.

Typical result fields:

- journal reference
- page references
- page titles and types
- normalized text or structured content
- content truncation metadata

Private GM information must remain governed by world settings and the authenticated GM context.

The Foundry implementation accepts a native JournalEntry ID or `JournalEntry.<id>` UUID and returns a JSON-only normalized document. Text pages include original HTML plus normalized plain text. Media pages may include their source path. Foundry flags, ownership records, executable values, and raw Document instances are not serialized.

### `getJournalPage`

Returns one selected page with a compact reference to its parent journal.

Typical inputs:

- journal ID or JournalEntry UUID
- page ID or JournalEntryPage UUID

This capability uses the same normalized page representation as `getJournal`, but avoids returning unrelated pages from a large parent journal. It is the preferred follow-up to a `searchJournals` result containing `matchedPageId`.

### `listScenes`

Returns a bounded list of scene summaries.

Typical result fields:

- LoreBridge document reference
- name
- active or navigation status
- dimensions or grid summary when useful
- linked journal reference when present
- folder context

Large scene data, tokens, walls, lighting, and embedded objects are excluded by default.

### `getScene`

Returns useful campaign context for one scene.

The first version should prioritize:

- identity and name
- description or linked journal context
- active status
- bounded list of actor or token references
- source references

Detailed tactical geometry should only be added through explicit future options because it can be large and platform-specific.

### `listCompendiums`

Returns compendium or content-pack summaries available to the connected source.

Typical result fields:

- pack reference
- label
- document type
- package owner
- entry count when available
- accessibility status

### `searchCompendium`

Searches one or more permitted compendiums.

Typical inputs:

- query
- optional pack scope
- optional document-type scope
- result limit

Typical result fields:

- pack and entry references
- entry name
- document type
- bounded summary or excerpt
- source metadata

### `getCompendiumEntry`

Returns one selected compendium entry through a stable reference.

The output should use the same normalized document shape as the equivalent world-document capability wherever practical.

## Capability negotiation

Adapters advertise the exact capability names and versions they support. The service must not assume that every adapter supports every capability.

Examples:

- a Foundry adapter may support actors, journals, scenes, and compendiums
- a LegendKeeper adapter may support pages and campaign knowledge but not scenes
- an Obsidian adapter may support notes and links but not actors as native documents

Unsupported capabilities return a structured `CAPABILITY_NOT_SUPPORTED` error.

## Read-only boundary

The initial capability set performs no creation, update, deletion, activation, combat, dice, macro, or arbitrary code operation.

Future write capabilities will be separately named and require:

- preview
- explicit confirmation
- narrow targeting
- permission checks
- audit records
- bounded rollback where supported
