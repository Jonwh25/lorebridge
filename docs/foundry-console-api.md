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

## AI generation

Requires a backend AI provider configured with `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY`. See the [Provider setup](https://github.com/Jonwh25/lorebridge/wiki/Provider-Setup) wiki page.

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
