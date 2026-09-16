# LoreBridge Roadmap

LoreBridge is developed in small, testable vertical slices. Each slice must
work through the complete path—shared contract, Foundry adapter, authenticated
backend, MCP tool, automated tests, and live Foundry verification—before it is
considered complete.

GitHub Issues are the source of truth for planned work. This file tracks active
and upcoming milestones. Completed milestone details live in
[CHANGELOG.md](CHANGELOG.md), newest first.

## Milestone 43 — Bug Fixes *(active)*

Correctness and hygiene bugs identified after M42.

1. [Bind Campaign Codex approval events to the resolved Foundry world](https://github.com/Jonwh25/lorebridge/issues/407)
2. ✅ [Derive backend serviceVersion from package.json at build time](https://github.com/Jonwh25/lorebridge/issues/408)

Success test: with two Foundry worlds connected, a Campaign Codex proposal
in world A produces an approval card only in world A; the backend health
endpoint reports the correct current version; `npm run validate` passes.

## Future / Unscheduled

- [Audit and rationalize npcProfile actor fields vs Campaign Codex journal fields](https://github.com/Jonwh25/lorebridge/issues/401) — decide which actor-side NPC fields to keep, retire, or migrate to CC journal dossier now that M41 establishes the journal as the canonical write target; requires M41 complete before design work begins.

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
