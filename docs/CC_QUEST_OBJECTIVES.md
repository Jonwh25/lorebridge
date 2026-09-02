# Campaign Codex quest objectives

LoreBridge can read and propose edits to the structured objectives on a Campaign
Codex Quest journal. This is separate from journal page text editing.

## Workflow

1. Connect a GM's Foundry session with Campaign Codex quest data available. To
   apply proposals, enable **Enable AI-Proposed Writes** in LoreBridge settings.
2. Find the journal ID using `search_journals` or `search_campaign`.
3. Call `get_quest_objectives` with `journalId` (and `sourceId` if needed). The
   response includes journal identity, source identity, overall quest status,
   and the first quest entry's objectives with nested sub-objectives.
4. Call `propose_quest_objectives_update` with `journalId`, `proposedObjectives`,
   and `rationale`. Supply the **complete intended objectives array**, including
   objectives that should remain unchanged. It is a replacement, not a patch.
5. Review the checklist diff in Foundry. Approve or reject each proposal, or use
   the panel's batch controls. Markers show incomplete `[ ]`, completed `[x]`,
   and failed `[!]` objectives.

For example: “Read this quest's objectives, then propose marking the delivery
objective complete while preserving the rest.”

Approval requires a GM and the write setting. The backend issues a single-use
token with a five-minute lifetime; an expired or used token requires a fresh
proposal. Rejection leaves the objectives unchanged. Approval updates the first
quest entry's objectives and preserves other quest fields and additional quest
entries. It does not edit the journal page's text body or change overall quest
status. There is no objective-specific Undo control.

Avoid editing the objectives manually while a proposal is pending. If they have
changed since the diff was prepared, reject it and request a fresh proposal;
the intended array replaces the objectives at approval time.

## Troubleshooting

- Missing tool: update both backend and module, reload Foundry, and reconnect
  the MCP client to refresh its tool list.
- No quest data: use a Campaign Codex Quest journal ID, not a page ID or a
  non-quest journal.
- Approval refused: verify the active user is a GM, the browser is paired, and
  **Enable AI-Proposed Writes** is enabled.
- Expired/used token: request a new proposal and review its new diff.

The optional browser-console fallback is
`LoreBridge.approveQuestObjectivesWrite(token)` or
`LoreBridge.rejectQuestObjectivesWrite(token)`. These consume the same pending
proposal; they do not accept arbitrary objective data or bypass the GM checks.
