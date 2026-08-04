# LoreBridge — Raven's Eye interoperability contract

This document is the compatibility gate for Milestone 12. It defines the
exact Raven's Eye version LoreBridge supports, maps Foundry and LoreBridge
concepts to the portable format, records extension-namespace conventions, and
describes compatibility and security behaviour.

## Pinned specification version

LoreBridge targets:

```
0.1.0-experimental
```

This version is enforced by `validateCampaignManifest`. Any backup file whose
`ravens-eye.yaml` carries a different `specification` value is rejected before
LoreBridge reads any other file in the repository.

Only LoreBridge's own backup output is guaranteed to round-trip cleanly through
this version. Third-party Raven's Eye repositories may require review before
they can be used as a restore source.

## Document identity mapping

| Foundry document | Raven's Eye record type | Stable ID prefix  |
|------------------|------------------------|-------------------|
| JournalEntry     | `entry`                | `entry:`          |
| Actor (NPC)      | `npc`                  | `npc:`            |
| Actor (PC)       | `player-character`     | `player-character:` |
| RollTable        | `table`                | `table:`          |
| Scene (linked place) | `place`           | `place:`          |

A stable ID is formed as `<type>:<uuidv4>`. LoreBridge generates one UUIDv4
per Foundry document on first export and reuses it on subsequent backups. The
stable ID is written into the record's `ravens-eye-metadata` comment and into
the Foundry fidelity extension block so that restores can remap it back to a
Foundry UUID.

Foundry Folders, Scenes, RollTable extension resources, and export scopes use
the following ID prefixes and live exclusively inside the extension namespace
(they are not portable core types):

| Extension resource  | Stable ID prefix           |
|---------------------|----------------------------|
| Folder              | `foundry-folder:`          |
| Scene               | `foundry-scene:`           |
| RollTable resource  | `foundry-roll-table:`      |
| Export scope        | `foundry-export-scope:`    |

## Visibility mapping

The Raven's Eye `audience` field maps directly to LoreBridge visibility modes:

| Raven's Eye audience | LoreBridge meaning           |
|----------------------|------------------------------|
| `facilitator`        | GM-only; never sent to players |
| `players`            | Player-safe content          |

LoreBridge writes `audience: facilitator` for GM-only documents and
`audience: players` for player-safe documents. The validator preserves the
`audience` value unchanged so that no visibility downgrade occurs silently
during restore.

## Extension namespaces

### `org.ravens-eye.foundry-vtt`

All Foundry-specific reconstruction data lives under this namespace. It is
never required by the portable core format; a tool without Foundry support may
ignore or preserve it.

**Inline journal provenance** — stored in a core `entry` record's
`extensions["org.ravens-eye.foundry-vtt"]` block:

```yaml
extensions:
  org.ravens-eye.foundry-vtt:
    sourceDocument:
      type: JournalEntry
      id: <foundry-id>
      uuid: JournalEntry.<foundry-id>
    pages:
      - section: <section-key>
        sort: <sort-value>
        contentKind: text          # or media
        mediaReference: <path>     # present only for media pages
        sourceDocument:
          type: JournalEntryPage
          id: <page-id>
          uuid: JournalEntry.<journal-id>.JournalEntryPage.<page-id>
```

**Standalone folder resource** — `extensions/org.ravens-eye.foundry-vtt/folders/<id>.yaml`:

```yaml
id: foundry-folder:<uuidv4>
type: folder
sourceDocument:
  type: Folder
  id: <foundry-id>
  uuid: Folder.<foundry-id>
documentType: Scene          # or Journal, Actor, RollTable
name: <folder-name>
sort: <sort-value>
parent: foundry-folder:<uuidv4>   # optional
```

**Standalone scene resource** — `extensions/org.ravens-eye.foundry-vtt/scenes/<id>.yaml`:

```yaml
id: foundry-scene:<uuidv4>
type: scene
sourceDocument:
  type: Scene
  id: <foundry-id>
  uuid: Scene.<foundry-id>
profile: structure           # or session-snapshot
folder: foundry-folder:<uuidv4>   # optional
place: place:<uuidv4>             # optional core place link
structure:
  foundrySourceData:
    name: <scene-name>
    navigation: false
    grid:
      type: 1
      size: 100
      distance: 5
      units: ft
    background:
      src: <path>
    walls: []
    lights: []
    drawings: []
    tiles: []
    regions: []
    tokens: []
references:                        # optional
  - role: <role>
    sourceUuid: <foundry-uuid>
    target: <type>:<uuidv4>
```

**Standalone roll-table resource** — `extensions/org.ravens-eye.foundry-vtt/roll-tables/<id>.yaml`:

```yaml
id: foundry-roll-table:<uuidv4>
type: roll-table
sourceDocument:
  type: RollTable
  id: <foundry-id>
  uuid: RollTable.<foundry-id>
coreRecord: table:<uuidv4>
formula: 1d6
replacement: true
displayRoll: true
results:
  - sourceId: <result-id>
    range: [1, 2]
    weight: 1
    drawn: false
```

**Export scope** — `extensions/org.ravens-eye.foundry-vtt/export-scope.yaml`:

```yaml
id: foundry-export-scope:<uuidv4>
type: export-scope
mode: selected-folders
selectedFolders:
  - foundry-folder:<uuidv4>
```

### `org.ravens-eye.dnd5e`

The D&D 5e extension is recognised but not required. It lives in a core
record's `extensions["org.ravens-eye.dnd5e"]` block and covers ability scores,
hit points, classes, skills, and capabilities per the Raven's Eye D&D profile.
LoreBridge preserves it without deep validation in the current release.

## Campaign manifest

Every backup repository contains a `ravens-eye.yaml` at the campaign root:

```yaml
specification: 0.1.0-experimental
id: campaign:<uuidv4>
name: <campaign-name>
playFormat: campaign           # or one-shot
coverage: partial              # folder-selection exports are always partial
gameSystem:
  id: dnd5e
  rulesRevision: "2024"
  extensionVersion: "1.0.0"
extensions:
  - id: org.ravens-eye.foundry-vtt
    version: "0.1.0-experimental"
```

`coverage: partial` is always written for folder-selection exports. A complete
world export would use `coverage: complete`, but LoreBridge does not yet
produce those.

## Compatibility and migration behaviour

- LoreBridge rejects any manifest whose `specification` is not exactly
  `0.1.0-experimental`. No silent degradation occurs.
- All schemas use `additionalProperties: true` (Raven's Eye preserve-or-refuse
  rule). Unknown fields in a valid envelope are preserved in the validated
  output; they are not stripped or mutated.
- A future LoreBridge release that supports a new spec version must add an
  explicit migration check and update the pinned version constant in
  `packages/shared/src/ravens-eye.ts`.
- The `extensionVersion` inside `gameSystem` tracks the Foundry extension
  schema version separately from the core spec version. Both must be checked
  during restore planning (implemented in later milestones).

## Repository layout

A folder-selection backup produces this layout inside the campaign root:

```text
ravens-eye.yaml
extensions/
  org.ravens-eye.foundry-vtt/
    export-scope.yaml
    folders/
      foundry-folder-<id>.yaml
    scenes/
      foundry-scene-<id>.yaml
    roll-tables/
      foundry-roll-table-<id>.yaml
<type>/
  <record-name>.md              ← core records with ravens-eye-metadata comment
```

## Security constraints

- `validateCampaignManifest`, `validateCoreRecord`, and all resource validators
  scan every object recursively for prototype-pollution keys (`__proto__`,
  `constructor`, `prototype`) and return errors if any are found.
- Extension object keys are checked for credential-like names (`token`,
  `password`, `secret`, `apiKey`, `accessToken`, etc.). Such fields must not
  appear in backup files; their presence causes validation failure.
- `validateFoundrySceneResource` checks `background.src` for path-traversal
  sequences (`../`). Other path-like fields receive the same check at the
  validator boundary.
- Repository credentials (GitHub personal access tokens, AI provider keys,
  LoreBridge pairing tokens) must never be written into backup files or logged
  during export or restore operations.
- GM-only content (`audience: facilitator`) must never be served to a
  player-facing endpoint. The `audience` field is validated and preserved
  on every round-trip.
- Unknown extension namespaces in a core record are preserved but not executed.
  LoreBridge only interprets `org.ravens-eye.foundry-vtt` and
  `org.ravens-eye.dnd5e`. Any other namespace is carried through validation
  unchanged and logged during restore planning.
