# LoreBridge

LoreBridge is an open-source bridge between AI assistants and tabletop roleplaying game campaign data.

The project begins with Foundry Virtual Tabletop and is designed to let a Game Master safely search, understand, and eventually update campaign information directly from an AI assistant such as ChatGPT.

## Project goals

- Connect AI assistants to a live Foundry VTT world through structured tools.
- Keep the Game Master in control of all access and changes.
- Start read-only and add write operations only with explicit safeguards.
- Retrieve only the campaign context needed for each request.
- Remain independent of any single AI provider or game system.
- Support additional campaign knowledge sources over time.

## Planned architecture

```text
ChatGPT or another MCP client
            |
            v
LoreBridge MCP server
            |
            v
Secure authenticated connection
            |
            v
LoreBridge Foundry module
            |
            v
Loaded Foundry VTT world
```

## Initial milestone

The first working version will be read-only and prove the complete connection from an AI client to Foundry.

Initial tools:

- `get_world_info`
- `list_journals`
- `search_journals`
- `get_journal`
- `list_actors`
- `get_actor`
- `list_scenes`
- `get_scene`

## Safety principles

- GM-only access
- Read-only by default
- Explicit allowlists for every operation
- No arbitrary JavaScript execution
- No direct database or filesystem access
- Authentication on every connection
- Auditable request logs
- Confirmation before sensitive or destructive writes

## Status

LoreBridge is in the initial design and scaffolding phase. It is not yet ready for installation.

See [VISION.md](VISION.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [ROADMAP.md](ROADMAP.md) for the current direction.

## License

LoreBridge is released under the [MIT License](LICENSE).
