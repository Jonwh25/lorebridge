# LoreBridge Roadmap

LoreBridge is developed in small, testable vertical slices. Each slice must
work through the complete path—shared contract, Foundry adapter, authenticated
backend, MCP tool, automated tests, and live Foundry verification—before it is
considered complete.

GitHub Issues are the source of truth for planned work. This file tracks active
and upcoming milestones. Completed milestone details live in
[CHANGELOG.md](CHANGELOG.md), newest first.

## Active

### Milestone 42 — Campaign Codex MCP Write Operations

Expose controlled, GM-approved write operations for Campaign Codex records
through the MCP interface. GMs can reorganize their CC structure — renaming
and moving Regions, Locations, and Entries between folders, updating
relationships between records, and setting location markers — directly from
an AI client without leaving Foundry. Every operation follows the same
before/after preview and GM approval chat card pattern used by
`propose_journal_update`.

1. [Campaign Codex document management: create, rename, move, and relate records via MCP](https://github.com/Jonwh25/lorebridge/issues/385)
2. [Combat narrator: spectacular narration for critical hits (nat 20) and fumbles (nat 1)](https://github.com/Jonwh25/lorebridge/issues/395)

Success test: rename a CC Location record, move it to a different folder,
and link it to a CC Region — all via MCP with GM approval in Foundry;
rejected operations produce a clear MCP error; nat 20 fires spectacular
crit narration and nat 1 fires fumble narration per narrator style;
`npm run validate` passes.

## Future / Unscheduled

- [Audit and rationalize npcProfile actor fields vs Campaign Codex journal fields](https://github.com/Jonwh25/lorebridge/issues/401) — decide which actor-side NPC fields to keep, retire, or migrate to CC journal dossier now that M41 establishes the journal as the canonical write target; requires M41 complete before design work begins.

## Completed

### Milestone 41 — Campaign Codex AI Field Coverage ✅

- [x] [Sync npcProfile AI-generated fields into npcDossier on generation](https://github.com/Jonwh25/lorebridge/issues/399)
- [x] [AI generation for NPC Dossier roleplay fields](https://github.com/Jonwh25/lorebridge/issues/396)
- [x] [AI generation for NPC Dossier overview fields](https://github.com/Jonwh25/lorebridge/issues/397)
- [x] [AI generation for NPC Dossier knowledge tab fields](https://github.com/Jonwh25/lorebridge/issues/398)
- [x] [AI generation for Campaign Codex Factions/Groups](https://github.com/Jonwh25/lorebridge/issues/400)

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
