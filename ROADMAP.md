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

### Milestone 37 — Journal Table & NPC List Formatting

*Planning in progress.*

## Completed

Completed milestones are listed newest first. Full change details, upgrade
notes, and issue links are in [CHANGELOG.md](CHANGELOG.md).

| Milestone | Title | Release |
|---|---|---|
| 35 | Deeper Foundry Retrieval | [v0.35.0](CHANGELOG.md) |
| 34 | Diagnostics & Release Safety | [v0.34.0](CHANGELOG.md) |
| 33 | Search & Codex Polish | [v0.33.0](CHANGELOG.md) |
| 32 | External World Building | [v0.32.0](CHANGELOG.md) |
| 31 | MCP Search & Filtering Improvements | [v0.31.0](CHANGELOG.md) |
| 30 | Third-Party Module Compatibility | [v0.30.0](CHANGELOG.md) |
| 29 | Quality of Life & Efficiency | [v0.29.0](CHANGELOG.md) |
| 28 | 1.0 Hardening | [v0.28.0](CHANGELOG.md) |
| 27 | Campaign Intelligence & Session Tracking | [v0.27.0](CHANGELOG.md) |
| 26 | Quality of Life & Small Enhancements | [v0.26.0](CHANGELOG.md) |
| 25 | Session and Character Portability | [v0.25.0](CHANGELOG.md) |
| 24 | Campaign Codex Integration: NPC Dossier Widget | [v0.24.0](CHANGELOG.md) |
| 23 | Campaign Memory Engine for Living NPCs | [v0.23.0](CHANGELOG.md) |
| 22 | Context Profile Advanced Scoping | [v0.22.0](CHANGELOG.md) |
| 21 | Context Profile Depth | [v0.21.0](CHANGELOG.md) |
| 20 | Controlled Live Operations | [v0.20.0](CHANGELOG.md) |
| 19 | Local-First Hybrid Search | [v0.19.0](CHANGELOG.md) |
| 18 | Safe Player Access | [v0.18.0](CHANGELOG.md) |
| 17 | NPC Profiles & AI Workspace | [v0.17.0](CHANGELOG.md) |
| 16 | NPC Creation & Reuse | [v0.16.0](CHANGELOG.md) |
| 15 | Live Session Workspace | [v0.15.0](CHANGELOG.md) |
| 14 | Campaign Curation & Integrity | [v0.14.0](CHANGELOG.md) |
| 13 | Write Quality & Post-Session Workflow | [v0.13.0](CHANGELOG.md) |
| 12 | Portable Campaign Backups | [v0.12.0](CHANGELOG.md) |
| 11 | Extensibility & Configuration | [v0.11.0](CHANGELOG.md) |
| 10 | MCP Tool Expansion | [v0.10.0](CHANGELOG.md) |
| 9 | World-Building Generation | [v0.9.0](CHANGELOG.md) |
| 8 | Foundry UI: Scene, Journal & Roleplay | [v0.8.0](CHANGELOG.md) |
| 7 | Foundry UI: Chat & Core Buttons | [v0.7.0](CHANGELOG.md) |
| 6 | Write Approval UI | [v0.6.0](CHANGELOG.md) |
| 5 | Controlled Writes | [v0.5.0](CHANGELOG.md) |
| 4 | Campaign Intelligence | [v0.4.0](CHANGELOG.md) |
| 3 | Foundry AI Generation | [v0.3.0](CHANGELOG.md) |
| 2 | Connected Knowledge | [v0.2.0](CHANGELOG.md) |
| 1 | Campaign Retrieval | [v0.1.0](CHANGELOG.md) |

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

When a milestone closes, move it from **Active** to the top of the
**Completed** table (newest first) and record its changes in
[CHANGELOG.md](CHANGELOG.md) under the corresponding release version.

Recommended project-board columns:

```text
Backlog → Ready → In Progress → Testing → Done
```

Recommended metadata:

- Priority: critical, high, medium, later
- Area: Foundry, backend, MCP, protocol, security, documentation
- Milestone: one of the delivery milestones above
