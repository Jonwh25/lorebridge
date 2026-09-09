# LoreBridge Roadmap

LoreBridge is developed in small, testable vertical slices. Each slice must
work through the complete path—shared contract, Foundry adapter, authenticated
backend, MCP tool, automated tests, and live Foundry verification—before it is
considered complete.

GitHub Issues are the source of truth for planned work. This file tracks active
and upcoming milestones. Completed milestone details live in
[CHANGELOG.md](CHANGELOG.md), newest first.

## Active

### Milestone 37 — Live Session Immersion

Bring AI-generated audio and narration directly into the live session experience.
Per-NPC voice profiles let GMs assign a distinct ElevenLabs voice to each NPC so
read-aloud text and combat flavor are spoken in a consistent, character-appropriate
voice. The AI Combat Narrator generates a short dramatic sentence for significant
combat events (hits, crits, kills) and can read it aloud using the attacker's
assigned voice. Backend dead code and stale version strings are cleaned up as part
of this milestone.

1. ✅ [Backend dead code & cleanup: remove JournalService stub, debug logs, stale version strings](https://github.com/Jonwh25/lorebridge/issues/374)
2. ✅ [Per-NPC voice profiles: assign ElevenLabs voices to NPC dossiers](https://github.com/Jonwh25/lorebridge/issues/379)
3. [AI Combat Narrator: generate dramatic flavor text for combat events](https://github.com/Jonwh25/lorebridge/issues/378)

Success test: a GM assigns a voice to a recurring NPC villain in the NPC
Workspace; during combat, a critical hit by that NPC triggers a flavor sentence
spoken aloud in the villain's assigned voice; the GM can toggle the narrator off
mid-session without a Foundry reload; backend `/health` returns the correct
current version.

## Upcoming

### Milestone 38 — Codebase Health

Eliminate two long-standing maintenance burdens before adding more features.
The Raven's Eye actor backup format is retired and its 735-line schema deleted;
actor backup consolidates entirely on the plain Markdown format introduced in
v0.29.0. Duplicated `parseContextArray` calls in `app.ts` are extracted to a
shared helper, and `tracker-shared.ts` is renamed to reflect its true role as
a general shared utilities module. No user-visible behavior changes.

1. [Retire Raven's Eye spec and consolidate actor backup to plain Markdown format](https://github.com/Jonwh25/lorebridge/issues/375)
2. [Code organization housekeeping: extract parseContextArray helper, restructure tracker-shared](https://github.com/Jonwh25/lorebridge/issues/376)

Success test: `npm run validate` passes; actor NPC and player GitHub backup
still produces Markdown files on the VM; no references to Raven's Eye types
remain in the codebase.

### Milestone 39 — Campaign Timeline

Build an auto-maintained campaign timeline that extracts major events from
session logs (NPC deaths, quest completions, faction shifts, location
discoveries, notable player actions) and displays them as a scrollable
chronological timeline in an ApplicationV2 dialog. The timeline is backed by
a GitHub-committed `lore/timeline.json` file and is accessible from the
Session Command Center.

1. [Campaign Timeline / In-World Chronicle: auto-maintained chronological event log](https://github.com/Jonwh25/lorebridge/issues/380)

Success test: running "Update Timeline" after a session log is created
extracts and persists new events; the timeline dialog displays events in
chronological order filterable by type; `timeline.json` is included in the
GitHub backup.

### Milestone 40 — Semantic Search

Replace keyword-based campaign search with vector/embedding search so AI
clients can answer natural-language queries across journals, actors, and
session logs. Initial implementation uses the hybrid Option C approach:
keyword search remains the default and semantic search is opt-in once an
embedding provider is configured.

1. [Semantic / embedding-based campaign search for MCP tools](https://github.com/Jonwh25/lorebridge/issues/377)

Success test: `search_campaign_semantic` MCP tool returns relevant results
for a natural-language query that existing keyword search misses; index
rebuild completes without blocking the adapter WebSocket; existing
`search_campaign` behavior is unchanged.

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
