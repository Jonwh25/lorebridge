# Foundry Browser Console API

LoreBridge exposes a GM-only browser API for querying campaign data and
triggering AI generation directly from the Foundry developer console. All
methods are available on the global `LoreBridge` object.

## Inspect the API

In a Foundry world, open the browser developer console and run:

```js
globalThis.LoreBridge
```

The object exposes:

- `version`: current Foundry module version
- `moduleVersion`: current Foundry module version
- `protocolVersion`: current LoreBridge protocol version
- `capabilities`: approved capability declarations

Module and protocol versions are intentionally independent. A Foundry packaging
or adapter fix can increment the module version without changing the protocol.

## Campaign retrieval

### `getWorldSummary()`

Returns identity, game system, and document counts for the loaded world.

```js
await LoreBridge.getWorldSummary()
```

```js
{
  source: { sourceId: "foundry:cos", adapterType: "foundry" },
  world: { id: "cos", title: "Curse of Strahd", foundryVersion: "14.365" },
  system: { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition", version: "5.3.3" },
  counts: { actors: 686, scenes: 624, journals: 842, installedModules: 7, activeModules: 7 }
}
```

### `searchJournals({ query, mode? })`

Full-text search across journal names, page names, and page content.

```js
await LoreBridge.searchJournals({ query: "Tser Falls" })
```

Optional `mode`: `"gm"` (default) or `"player"`. Player mode filters to
documents with Observer or higher ownership and includes `hiddenCount`.

### `getJournalPage({ journalId, pageId })`

Retrieve one journal page by ID.

```js
await LoreBridge.getJournalPage({ journalId: "...", pageId: "..." })
```

### `searchActors({ query, type?, mode? })`

Search actors by name or description. Optionally filter by actor type.

```js
await LoreBridge.searchActors({ query: "vampire", type: "npc" })
```

### `getActor({ actorId, mode? })`

Retrieve identity and descriptive information for one actor.

```js
await LoreBridge.getActor({ actorId: "..." })
```

### `searchScenes({ query, mode? })`

Search scenes by name.

```js
await LoreBridge.searchScenes({ query: "castle" })
```

### `getScene({ sceneId, mode? })`

Retrieve one scene with linked journal, map notes, and placed tokens.

```js
await LoreBridge.getScene({ sceneId: "..." })
```

### `getActiveScene({ mode? })`

Return the scene currently viewed by the GM.

```js
await LoreBridge.getActiveScene()
```

### `resolveUuid({ uuid, mode? })`

Resolve any Foundry UUID to a normalized actor, journal, journal page, or scene.

```js
await LoreBridge.resolveUuid({ uuid: "JournalEntry.abc123.JournalEntryPage.def456" })
```

### `searchCampaign({ query, mode? })`

Cross-type search across actors, journals, and scenes when the document type
is unknown.

```js
await LoreBridge.searchCampaign({ query: "Strahd" })
```

### `getRelatedDocuments({ uuid, mode? })`

Starting from any UUID, return directly related documents one hop away via
embedded UUID links and map note references.

```js
await LoreBridge.getRelatedDocuments({ uuid: "JournalEntry.abc123" })
```

### `searchItems({ query, type?, mode? })`

Search world items by name or description. Optionally filter by item type
(e.g. `"weapon"`, `"spell"`, `"equipment"`).

```js
await LoreBridge.searchItems({ query: "sword", type: "weapon" })
```

### `getActorInventory({ actorName, mode? })`

List all items carried by a named actor with quantity, weight, price, rarity,
identification status, and description.

```js
await LoreBridge.getActorInventory({ actorName: "Ireena Kolyana" })
```

### `searchSessionLogs({ query, journalName? })`

Search pages in the session log journal by keyword. Returns session numbers,
excerpts, and page IDs.

```js
await LoreBridge.searchSessionLogs({ query: "werewolf" })
await LoreBridge.searchSessionLogs({ query: "tavern", journalName: "Session Logs" })
```

### `getSessionLog({ journalId, pageId })`

Retrieve the full plain-text content of one session log page.

```js
await LoreBridge.getSessionLog({ journalId: "...", pageId: "..." })
```

### `listCompendiums({ mode? })`

List all compendium packs available in the world with document type and entry
count. Respects the **Excluded Compendiums** world setting.

```js
await LoreBridge.listCompendiums()
```

### `searchCompendium({ query, packId?, type? })`

Search compendium pack indexes by entry name without importing documents.

```js
await LoreBridge.searchCompendium({ query: "fireball" })
await LoreBridge.searchCompendium({ query: "goblin", packId: "dnd5e.monsters" })
```

### `getCompendiumEntry({ packId, entryId })`

Retrieve a specific compendium index entry by pack ID and entry ID.

```js
await LoreBridge.getCompendiumEntry({ packId: "dnd5e.monsters", entryId: "..." })
```

## GM write approval

Requires **Enable AI-Proposed Writes** to be on in LoreBridge world settings.
Write tokens are single-use and expire after five minutes.

### `approveWrite(token)`

Validate an approval token and execute the proposed journal page update.
Returns a before/after audit summary.

```js
await LoreBridge.approveWrite("a1b2c3d4-...")
```

```js
{
  success: true,
  journalId: "...",
  pageId: "...",
  pageName: "Blue Water Inn",
  before: "<p>The inn is a two-story building...</p>",
  after: "<p>The inn is a two-story building... The kitchen was burned down...</p>"
}
```

### `rejectWrite(token)`

Mark a write token as used without executing the write. Prevents the token
from being approved later.

```js
await LoreBridge.rejectWrite("a1b2c3d4-...")
```

Both `approveWrite` and `rejectWrite` are also triggered automatically by the
**Approve** and **Reject** buttons in the GM write approval dialog that appears
in Foundry when an AI proposes a journal update via `propose_journal_update`.

## AI generation

Requires a backend AI provider configured with `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY`. See the [Provider setup](https://github.com/Jonwh25/lorebridge/wiki/Provider-Setup) wiki page.

As of v0.7.0, most generation is available directly inside Foundry via header
buttons and the `/lb` chat command — no console access required. The console
methods below remain available for scripting and testing.

### `/lb` chat command

Type `/lb <question>` in the Foundry chat bar. The AI searches campaign
documents for context and whispers the answer to all GM users.

```
/lb Who is Strahd and where did the party last see him?
```

### In-Foundry generation buttons

| Sheet | Button | Action |
| --- | --- | --- |
| Journal entry | Feather icon (header) | Generate Description — read-aloud boxed text appended to the active page |
| Journal entry (name contains "session") | Scroll icon (header) | Session Recap — narrative recap appended to the active page |
| NPC actor sheet | Robot icon (header) | NPC Profile — personality, mannerism, and GM-only secret appended to biography |
| Scene sheet | Dice icon (header) | Encounter Suggestions — 2–3 encounter hooks shown in a read-only dialog |
| Any journal | Question-mark input (bottom) | Journal Q&A — answer grounded in the active page content, shown in a dialog |

The header buttons (feather, scroll, robot, dice) open a configuration dialog
(tone, length), show a preview, and save to the document only when the GM
clicks **Save to Journal**. The scene encounter dialog and journal Q&A dialog
are read-only — they display results without modifying any document.

### `/lb roleplay` command (v0.8.0+)

Start an in-character conversation with any actor in the world:

```
/lb roleplay Strahd von Zarovich
```

Then speak to the NPC:

```
/lb What do you want from us?
```

End the session:

```
/lb end
```

Responses are whispered to all GM users. The actor's biography is used as
character context. Conversation history is kept in memory for the session
(bounded to the last 20 turns) and is not persisted across reloads.

### `generateBoxedText(input)`

Generate read-aloud boxed text from a journal page or scene without modifying
any Foundry document. Returns a preview string and the sources used.

```js
const page = await LoreBridge.getJournalPage({ journalId: "...", pageId: "..." });

const result = await LoreBridge.generateBoxedText({
  content: page.page.text.plainText.slice(0, 2000),
  documentName: page.page.name,
  documentType: "journalPage",   // "journalPage" | "scene"
  sourceId: page.sourceId,
  sourceName: page.sourceName,
  tone: "gothic",                // gothic | neutral | heroic | mysterious
  length: "medium",              // short | medium | long
  audience: "players",           // players | gm (optional)
});

console.log(result.preview);
```

Response shape:

```js
{
  preview: "The mist clings...",
  sources: [{ sourceId: "...", sourceName: "..." }],
  provider: "anthropic",
  tone: "gothic",
  length: "medium"
}
```

## Visibility modes

All retrieval methods accept an optional `mode` parameter:

| Mode | Behavior |
| --- | --- |
| `"gm"` (default) | Returns all documents regardless of ownership |
| `"player"` | Filters to documents with world-level Observer or higher ownership; includes `hiddenCount` on results reporting how many documents were excluded |

## Errors

Capability failures throw `LoreBridgeCapabilityError`:

```js
{
  name: "LoreBridgeCapabilityError",
  code: "NOT_AUTHORIZED",
  message: "LoreBridge getWorldSummary requires an active GM user.",
  retryable: false
}
```

Error codes:

| Code | Meaning |
| --- | --- |
| `NOT_AUTHORIZED` | The active Foundry user is not a GM, or the client token was rejected |
| `ADAPTER_UNAVAILABLE` | Foundry is absent or the world is not fully initialized |
| `PROVIDER_UNAVAILABLE` | No AI provider is configured or the provider health check failed |
| `INTERNAL_ERROR` | LoreBridge could not produce a schema-valid normalized result |
