# LoreBridge Roadmap

LoreBridge is developed in small, testable vertical slices. Each slice must
work through the complete path—shared contract, Foundry adapter, authenticated
backend, MCP tool, automated tests, and live Foundry verification—before it is
considered complete.

GitHub Issues are the source of truth for planned work. This file tracks active
and upcoming milestones. Completed milestone details live in
[CHANGELOG.md](CHANGELOG.md), newest first.

## Active

### Milestone 36 — Journal Block Taxonomy & Read-Aloud Styling

Define and implement a complete LoreBridge journal block taxonomy so that
AI-generated journal pages have consistent, visually distinct styling for every
structured block type (read-aloud narration, flavor asides, in-world documents,
mechanical call-outs, treasure summaries, and encounter notes).

1. ✅ [Implement Standardized Journal Block Taxonomy for AI-Generated Content](https://github.com/Jonwh25/lorebridge/issues/370)
2. [Structured formatting for AI-generated NPC lists and tables](https://github.com/Jonwh25/lorebridge/issues/372)
3. [Configurable color palette for journal block types in LoreBridge settings](https://github.com/Jonwh25/lorebridge/issues/373)

All blocks use `<blockquote class="lb-{type}">` — the one block-level element
ProseMirror's schema preserves reliably on save. A shared stylesheet registered
in `module.json` provides accent colors, badge labels, and typography for each
type. Block label HTML is hardcoded in the backend so AI outputs plain text
only. The `propose_journal_update` MCP tool description embeds all six block
patterns so any Claude session knows the format without extra prompting.

Success test: a GM saves AI-generated boxed text, a session recap, and a
session prep page into Foundry; each block renders with its correct accent color
and badge label; opening and saving those pages in ProseMirror does not strip or
corrupt the `blockquote` tags; GMs can change block accent colors from
LoreBridge settings without a Foundry reload.

## Upcoming

### Milestone 37 — Unplanned

*Not yet planned.*

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
