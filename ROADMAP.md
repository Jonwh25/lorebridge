# LoreBridge Roadmap

LoreBridge is developed in small, testable vertical slices. Each slice must
work through the complete path—shared contract, Foundry adapter, authenticated
backend, MCP tool, automated tests, and live Foundry verification—before it is
considered complete.

GitHub Issues are the source of truth for planned work. This file tracks active
and upcoming milestones. Completed milestone details live in
[CHANGELOG.md](CHANGELOG.md), newest first.

## Active

### Milestone 40 — Semantic Search

Replace keyword-based campaign search with vector/embedding search so AI
clients can answer natural-language queries across journals, actors, and
session logs. Initial implementation uses the hybrid Option C approach:
keyword search remains the default and semantic search is opt-in once an
embedding provider is configured.

1. [Semantic / embedding-based campaign search for MCP tools](https://github.com/Jonwh25/lorebridge/issues/377)
2. [Incremental index updates — only re-embed changed/new documents](https://github.com/Jonwh25/lorebridge/issues/392)

Success test: `search_campaign_semantic` MCP tool returns relevant results
for a natural-language query that existing keyword search misses; index
rebuild completes without blocking the adapter WebSocket; existing
`search_campaign` behavior is unchanged; incremental rebuild with no changes
makes zero embedding API calls.

### Milestone 41 — Campaign Codex Document Management

Expose controlled, GM-approved write operations for Campaign Codex records
through the MCP interface. GMs can reorganize their CC structure — renaming
and moving Regions, Locations, and Entries between folders, updating
relationships between records, and setting location markers — directly from
an AI client without leaving Foundry. Every operation follows the same
before/after preview and GM approval chat card pattern used by
`propose_journal_update`.

1. [Campaign Codex document management: create, rename, move, and relate records via MCP](https://github.com/Jonwh25/lorebridge/issues/385)

Success test: rename a CC Location record, move it to a different folder,
and link it to a CC Region — all via MCP with GM approval in Foundry;
rejected operations produce a clear MCP error; `npm run validate` passes.

## Completed

See [CHANGELOG.md](CHANGELOG.md) for all released versions.

## Planning workflow

LoreBridge uses a lightweight workflow:

1. Capture each concrete feature, bug, or engineering improvement as a GitHub
   Issue.
2. Assign one priority label, the relevant area labels, a milestone, and
   `Jonwh25` as assignee.
3. Move only well-defined work into **Ready**.
4. Create a feature branch linked to the issue.
5. Open a draft pull request and keep it in **In Progress**.
6. Run automated validation and a proportionate live Foundry test.
7. Move the work to **Testing**, then merge only after it passes.
8. Close the linked issue and move it to **Done**.
9. Group several verified incremental changes into a release instead of
   versioning every merge.

When a milestone closes, remove it from **Active** and record its changes in
[CHANGELOG.md](CHANGELOG.md) under the corresponding release version.

Recommended project-board columns:

```text
Backlog → Ready → In Progress → Testing → Done
```

Recommended metadata:

- Priority: critical, high, medium, later
- Area: Foundry, backend, MCP, protocol, security, documentation
- Milestone: one of the delivery milestones above
