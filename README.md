# LoreBridge

[![Foundry VTT v14](https://img.shields.io/badge/Foundry_VTT-v14-2ea44f)](https://foundryvtt.com/)
[![Release](https://img.shields.io/github/v/release/Jonwh25/lorebridge?label=release)](https://github.com/Jonwh25/lorebridge/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Jonwh25/lorebridge/total?label=downloads)](https://github.com/Jonwh25/lorebridge/releases)
[![License](https://img.shields.io/github/license/Jonwh25/lorebridge)](https://github.com/Jonwh25/lorebridge/blob/main/LICENSE)

LoreBridge is a secure, GM-controlled bridge between a live Foundry Virtual
Tabletop world and AI assistants that support the Model Context Protocol (MCP).
It lets an assistant retrieve attributable campaign information, help prepare
and run sessions, and propose carefully controlled changes without exposing raw
Foundry documents or provider credentials.

> [!IMPORTANT]
> LoreBridge is an early developer preview. Authentication, configuration, and
> deployment may change between releases.

## What you can do

- Ask questions grounded in journals, actors, scenes, items, roll tables,
  playlists, compendiums, session logs, combat, chat, and linked campaign
  sources, with optional folder-scoped search.
- Get source citations and stable Foundry identifiers with bounded results.
- Let players ask questions through the optional GM-curated Player Lore
  Assistant without exposing hidden campaign material.
- Generate session preparation, boxed text, roll tables, NPC profiles, D&D 5e
  stat blocks, portraits, and in-character dialogue inside Foundry.
- From any MCP client, generate a complete D&D 5e NPC, a custom item (weapon,
  spell, feat, consumable, equipment, background, race, class, subclass, and
  more), or a balanced encounter and push it into Foundry through GM approval
  without opening the Foundry UI.
- Review AI-proposed journal changes with a diff, explicit GM approval, and
  rollback support.
- With a separate opt-in, ask the GM to approve advancing one combat turn,
  correcting one combatant's initiative, or ending the active encounter.
- Check campaign health, audit consistency, scope searches with Context
  Profiles, and back up campaign content to a private GitHub repository using
  per-category backup buttons with folder-selection dialogs and live progress.
  [Campaign Codex exports](docs/CC_EXPORT_CACHE.md) skip unchanged files and
  report committed and unchanged counts per folder.
- Provision a new group for a session: create Foundry users and linked PC
  actors with random passwords from the **Player Party** option in the Create
  Actor dialog; distribute hotbar pages to connected players from the Macros
  sidebar; and reset non-GM accounts with **Remove All Players** from the
  Session Command Center.
- Let players import their own character from a backup using **Import from
  Backup** in the actor sheet header without exposing other actors or GM data.

Example requests:

> “Summarize the last three sessions and list the unresolved threads.”

> “What do my journals say about the Amber Temple? Cite the exact pages.”

> “What items is Ireena carrying right now?”

> “Propose an update to the Blue Water Inn journal noting what happened last
> session.”

## How it works

```text
AI client (Claude, Codex, or another MCP client)
             |
             | HTTPS + authenticated MCP
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

The backend authenticates each client with its own pairing token and routes
requests to the module running in the GM's browser. The module exposes a narrow
set of normalized capabilities rather than arbitrary Foundry access.

Search is local-first: LoreBridge combines Spotlight Omnisearch metadata
candidates, Foundry v14 native collection search, and its existing bounded
content scanners. Every candidate is resolved against current Foundry state and
passed through LoreBridge permissions, Context Profiles, compendium exclusions,
result limits, excerpts, ranking, and source attribution. If Spotlight is empty
or rebuilding, native search and content scanners remain available.

## Major capabilities

| Area | Highlights |
| --- | --- |
| Campaign retrieval | World summary; folder-aware journal, actor, scene, item, macro, roll-table, and playlist discovery; compendium, asset, chat, combat, and session-log retrieval |
| Connected knowledge | Cross-type search, UUID resolution, related-document traversal, citations, and Context Profiles |
| Foundry assistance | `/lb` questions, journal Q&A, session preparation, NPC roleplay, world-building generators, and roll tables |
| NPC creation | Profiles, native D&D 5e field synchronization, stat blocks, portraits, generation history, optional voice responses, and persistent memory that accumulates from live roleplay |
| External world building | `generate_npc`/`create_actor`/`update_actor` for NPC creation and editing; `generate_item`/`create_item`/`update_item` for 12 D&D 5e item types (weapon, spell, feat, consumable, equipment, loot, tool, background, race, container, class, subclass); `generate_encounter`/`create_encounter` for balanced encounter building with token placement; `update_scene` for scene property edits — all from an MCP client without opening Foundry |
| Campaign Codex integration | Optional NPC Dossier widgets that register with Campaign Codex — four structured sidebar tabs (Info, Profile, Roleplaying, Knowledge) auto-added to NPC journals; GM Secrets in native Foundry secret blocks; dossier data consumed by LoreBridge generation and roleplay |
| Player Lore | GM-published, permission-checked public answers from an explicit journal allowlist |
| Controlled writes | Previewed journal updates plus opt-in combat turn, initiative, and encounter-ending proposals with single-use GM approval, conflict checks, diffs, and rollback where supported |
| Campaign operations | Health checks, consistency audits, post-session cleanup, recaps, configurable per-category GitHub backups with folder hierarchy, and AI session log tracking (NPC status, encounters, quest progress, region visits) with automatic player permission sync |
| Session tools | **AI NPC** and **Player Party** in the Create Actor dialog; **Distribute Hotbar to Players** in the Macros sidebar; **Remove All Players** in the Session Command Center; **Import from Backup** in the actor sheet header; **Post-Session Checklist** runs all trackers and GitHub backup in one step; **CC Journal Export** pushes all Campaign Codex journals to GitHub; **GitHub Backups** section in the Session Command Center provides per-category backup buttons (NPCs, Players, Journals, Macros, Session Logs) each with folder-picker dialogs and live progress |
| Extensibility | Discover all world script macros with folder context and callable status; invoke only GM-authored macro tools exposed through an explicit declaration and feature gate |

See the [user guide](https://github.com/Jonwh25/lorebridge/wiki/Using-LoreBridge)
for workflows and examples, and the
[AI client setup guide](https://github.com/Jonwh25/lorebridge/wiki/AI-Client-Setup#available-tools)
for the complete MCP tool catalog.

## Security model

- The backend binds to loopback and is published through an HTTPS reverse
  proxy; its application port should not be exposed directly.
- Every Foundry and AI client authenticates with a separate pairing token.
- Remote access is bounded and read-only by default.
- Writes require explicit feature enablement, a preview, and single-use GM
  approval for the exact proposed change.
- Player Lore requires both GM publication and effective Foundry permission for
  every non-GM user.
- Spotlight candidates are advisory only. LoreBridge never invokes Spotlight
  actions, macros, utilities, or other executable terms.
- Provider credentials stay in backend environment variables and are never
  stored in Foundry or returned to clients.
- LoreBridge provides no arbitrary JavaScript, raw database, or unrestricted
  filesystem access through MCP.

Read the detailed [Player Lore security model](https://github.com/Jonwh25/lorebridge/wiki/Player-Lore-Assistant#security-model)
and [local-first search boundaries](https://github.com/Jonwh25/lorebridge/wiki/Local-First-Hybrid-Search#safety-and-permissions).

## Requirements

- Foundry Virtual Tabletop v14 with a world open in a GM browser
- Spotlight Omnisearch 4.0.2 or newer, installed and enabled
- Node.js 20 or newer and npm 10 or newer for the backend
- A Linux or Windows backend host
- A public HTTPS hostname and reverse proxy such as Caddy, Nginx, or IIS
- Claude, Codex, or another MCP client with HTTP Bearer authentication

Dig Down is optional. When it owns file discovery in a large world, keep
Spotlight file search disabled to avoid maintaining duplicate file indexes.
LoreBridge does not modify either module's settings automatically.

## Get started

Start with the [installation overview](https://github.com/Jonwh25/lorebridge/wiki/Installation),
then follow the guides for your environment:

- [Linux backend](https://github.com/Jonwh25/lorebridge/wiki/Backend-Linux) or [Windows backend](https://github.com/Jonwh25/lorebridge/wiki/Backend-Windows)
- [Pair the Foundry module](https://github.com/Jonwh25/lorebridge/wiki/Foundry-Pairing)
- [Connect an AI client](https://github.com/Jonwh25/lorebridge/wiki/AI-Client-Setup)
- [Configure an AI provider](https://github.com/Jonwh25/lorebridge/wiki/Provider-Setup) or [image provider](https://github.com/Jonwh25/lorebridge/wiki/Image-Provider-Setup)

For ongoing use, see the [wiki home](https://github.com/Jonwh25/lorebridge/wiki),
[updating guide](https://github.com/Jonwh25/lorebridge/wiki/Updating), and
[troubleshooting guide](https://github.com/Jonwh25/lorebridge/wiki/Troubleshooting).

## Developer documentation

- [Architecture](ARCHITECTURE.md)
- [Capability reference](docs/CAPABILITIES.md)
- [Internal protocol](docs/LOREBRIDGE_PROTOCOL.md)
- [Contributing](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)
- [Releasing](docs/RELEASING.md)

## License

LoreBridge is released under the [MIT License](LICENSE).
