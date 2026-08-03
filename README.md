# LoreBridge

LoreBridge is a secure, GM-controlled bridge that lets an AI assistant retrieve
live campaign information from a loaded Foundry Virtual Tabletop world.

> [!IMPORTANT]
> LoreBridge is an early developer preview. The authentication, configuration,
> and deployment process may still change between releases.

## What you can ask

Once LoreBridge is connected, your AI client has live access to everything in
your Foundry world. Here are a few things you can ask during a session or while
prepping:

**Before the session**
> *"Summarize what happened in the last three sessions and remind me what loose ends the players left open."*

> *"What do I need to know about Strahd before tonight? Give me his personality, his goals, and where the players last saw him."*

> *"The party is heading to the Blue Water Inn. What's in my journal about it — layout, key NPCs, anything I've already written?"*

**During the session**
> *"The players just asked about the symbol on the door. Search my journals for anything about that symbol."*

> *"What items does Ireena have in her inventory right now?"*

> *"Roll a d20 and describe what the rogue finds when they search the body."*  *(with dice tool enabled)*

**Writing content**
> *"Write a gothic, atmospheric room description for the entrance hall of Castle Ravenloft. Use what's in my journal for the details."*

> *"Update my Blue Water Inn journal page to note that the players burned down the kitchen and are now banned from the common room."*

The last example triggers the write approval flow — a dialog pops up in
Foundry showing you exactly what will change, and nothing is written until you
click **Approve**.

---

## How it works

```text
AI client (Claude, Codex, or any MCP client)
             |
             | HTTPS + MCP
             v
      LoreBridge backend
             |
             | authenticated WebSocket
             v
     LoreBridge Foundry module
             |
             v
      Loaded Foundry world
```

The AI client connects to the LoreBridge backend over HTTPS using the
[Model Context Protocol](https://modelcontextprotocol.io). The backend
authenticates the client with a pairing token and routes requests to a
Foundry module running in the GM's browser. The module executes a narrow
allowlist of read-only Foundry operations and returns structured data.

Provider credentials are never stored in Foundry. LoreBridge does not execute
arbitrary JavaScript or provide write access to the world.

## Current tools

All tools accept an optional `mode` parameter (`"gm"` or `"player"`). In player
mode, results are filtered to documents with world-level Observer or higher
ownership and `hiddenCount` reports how many documents were excluded. GM mode
(the default) returns all documents.

| Tool | Description |
| --- | --- |
| `get_world_summary` | World identity, game system, and document counts |
| `search_journals` | Full-text search across journal names, page names, and page content |
| `get_journal_page` | Retrieve one journal page by ID |
| `search_actors` | Search actors by name or description, with optional type filtering |
| `get_actor` | Retrieve identity and descriptive information for one actor |
| `search_scenes` | Search scenes by name |
| `get_scene` | Retrieve one scene with linked journal, map notes, and placed tokens |
| `get_active_scene` | Return the scene currently viewed by the GM |
| `get_combat_state` | Active initiative order, round, current turn, and GM/player-safe combatant details |
| `roll_dice` | Evaluate a Foundry dice formula; public chat posting is explicit and optional |
| `get_chat_messages` | Retrieve bounded recent chat history with GM/player visibility filtering |
| `search_assets` | Find configured Foundry data-directory image and audio assets by filename |
| `resolve_uuid` | Resolve any Foundry UUID to a normalized actor, journal, journal page, or scene |
| `search_campaign` | Cross-type search across actors, journals, and scenes when the document type is unknown |
| `get_related_documents` | Starting from any UUID, return directly related documents one hop away |
| `search_items` | Search world items by name or description, with optional type filtering |
| `get_actor_inventory` | List all items carried by a named actor with quantity, weight, price, rarity, and identification status |
| `search_session_logs` | Search pages in the session log journal by keyword, returning session numbers and excerpts |
| `get_session_log` | Retrieve the full text of one session log page |
| `list_compendiums` | List available compendium packs with document type and entry count |
| `search_compendium` | Search compendium indexes by entry name without importing documents |
| `get_compendium_entry` | Retrieve a specific compendium entry by pack and entry ID |
| `propose_journal_update` | Propose a journal page content change; triggers a GM-only Foundry dialog with Approve/Reject buttons — no write occurs until the GM approves |

The world must be open in a GM browser for live tools to work. The Foundry
module connects automatically and reconnects after a backend restart.

## AI generation

When a backend AI provider is configured, GMs can generate content directly
inside Foundry without opening a browser console or MCP client.

### In-Foundry buttons (v0.7.0+)

| Where | Button | What it generates |
| --- | --- | --- |
| Any journal page | Feather icon in header | Read-aloud boxed text appended to the active page |
| Session log journals | Scroll icon in header | Second-person narrative recap appended to the active page |
| Session log journals | Wizard-hat icon in header | Lazy DM session prep saved to "Lazy DM Prep" journal (v0.9.0+) |
| NPC actor sheets | Robot icon in header | Personality, mannerism, and GM-only secret appended to biography |
| Scene sheets | Dice icon in header | 2–3 encounter hooks grounded in scene name, linked journal, and tokens |
| Any journal page | Question-mark input at bottom | Inline Q&A grounded in the active page content |

### `/lb` chat command (v0.7.0+)

Type `/lb <question>` in the Foundry chat bar to ask the AI a question grounded
in your campaign. The answer is whispered to GM users only.

```
/lb Who is Strahd and where did the party last see him?
```

### `/lb roleplay` — in-character NPC conversations (v0.8.0+)

```
/lb roleplay Strahd von Zarovich
/lb What do you want from us?
/lb end
```

Starts an in-character conversation with any actor in your world. Responses are
whispered to GM users only and the NPC's biography is used as context. Type
`/lb end` to exit roleplay mode.

### `/lb city` and `/lb npcs` — world-building generators (v0.9.0+)

```
/lb city a corrupt port city on the edge of a cursed forest
/lb npcs 5 the village of Barovia
```

Generates a full city/location profile or a cast of NPCs grounded in existing
campaign lore. A preview dialog shows the generated content; clicking **Save as
Journal** creates a new page in "Generated Locations" or "Generated NPCs"
and opens the journal automatically.

The optional leading number in `/lb npcs` sets the count (default 5, max 10).

### Browser console API

Generation is also available from the Foundry developer console for scripting
or testing:

```js
const page = await LoreBridge.getJournalPage({ journalId: "...", pageId: "..." });

const result = await LoreBridge.generateBoxedText({
  content: page.page.text.plainText.slice(0, 2000),
  documentName: page.page.name,
  documentType: "journalPage",
  sourceId: page.sourceId,
  sourceName: page.sourceName,
  tone: "gothic",    // gothic | neutral | heroic | mysterious
  length: "medium",  // short | medium | long
  audience: "players",
});

console.log(result.preview);
```

Provider credentials (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) are set as
environment variables on the backend and are never stored in Foundry or
returned by any API. See [Provider setup](docs/provider-security.md).

## Requirements

- Foundry Virtual Tabletop v14
- A Foundry world open in a GM browser session
- Node.js 20 or newer and npm 10 or newer
- A host for the LoreBridge backend (Linux or Windows; running it on the same
  host as Foundry is the simplest deployment)
- A public HTTPS hostname and a reverse proxy (Caddy, Nginx, or IIS)
- An MCP client (Claude Desktop, Codex, or any client that supports MCP over
  HTTP with Bearer token authentication)

## Getting started

Full installation and configuration guides are on the
[LoreBridge Wiki](https://github.com/Jonwh25/lorebridge/wiki):

- [Installation overview](https://github.com/Jonwh25/lorebridge/wiki/Installation)
- [Backend setup — Linux](https://github.com/Jonwh25/lorebridge/wiki/Backend-Linux)
- [Backend setup — Windows](https://github.com/Jonwh25/lorebridge/wiki/Backend-Windows)
- [Reverse proxy — Caddy](https://github.com/Jonwh25/lorebridge/wiki/Reverse-Proxy-Caddy)
- [Reverse proxy — Nginx](https://github.com/Jonwh25/lorebridge/wiki/Reverse-Proxy-Nginx)
- [Reverse proxy — IIS](https://github.com/Jonwh25/lorebridge/wiki/Reverse-Proxy-IIS)
- [Pairing the Foundry module](https://github.com/Jonwh25/lorebridge/wiki/Foundry-Pairing)
- [Connecting an AI client](https://github.com/Jonwh25/lorebridge/wiki/AI-Client-Setup)
- [Updating LoreBridge](https://github.com/Jonwh25/lorebridge/wiki/Updating)
- [Troubleshooting](https://github.com/Jonwh25/lorebridge/wiki/Troubleshooting)

## Security model

- The backend binds to loopback (`127.0.0.1`) and is published through a
  reverse proxy over HTTPS; port 3210 is never exposed directly to the internet
- Every client — including the Foundry module — authenticates with a pairing
  token before any capability is available
- Each AI client uses its own dedicated token, separate from the Foundry browser
  token
- Read tools are read-only; write operations require the **Enable AI-Proposed Writes** world setting to be on, and every proposed change requires explicit single-use GM approval before any document is modified
- An explicit allowlist controls which Foundry operations the module may execute
- No arbitrary JavaScript is evaluated; no direct database or filesystem access
  is provided through MCP
- Provider API keys are set as backend environment variables and are never stored
  in Foundry, logged, or returned by any endpoint — only `{ provider, enabled, healthy }` is ever exposed

## Developer documentation

- [Architecture](ARCHITECTURE.md)
- [Capability reference](docs/CAPABILITIES.md)
- [Internal protocol](docs/LOREBRIDGE_PROTOCOL.md)
- [Contributing](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)
- [Releasing](docs/RELEASING.md)

## License

LoreBridge is released under the [MIT License](LICENSE).
