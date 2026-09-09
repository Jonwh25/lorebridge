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
2. [Per-NPC voice profiles: assign ElevenLabs voices to NPC dossiers](https://github.com/Jonwh25/lorebridge/issues/379)
3. [AI Combat Narrator: generate dramatic flavor text for combat events](https://github.com/Jonwh25/lorebridge/issues/378)

Success test: a GM assigns a voice to a recurring NPC villain in the NPC
Workspace; during combat, a critical hit by that NPC triggers a flavor sentence
spoken aloud in the villain's assigned voice; the GM can toggle the narrator off
mid-session without a Foundry reload; backend `/health` returns the correct
current version.

## Upcoming

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
