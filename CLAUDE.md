# Claude Code instructions

Read and follow [`AGENTS.md`](AGENTS.md) and
[`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) before making
changes.

Those files are the canonical LoreBridge workflow. Do not invent a separate
Claude-specific process.
When creating GitHub issues, follow the **GitHub issue creation** policy in
`AGENTS.md`, including its labeling, assignment, milestone, and verification
requirements.
After implementing code, follow the **Live testing handoff** policy in
`AGENTS.md`. Always provide the tailored commands and manual acceptance test; do
not wait for the user to ask for testing instructions.
For Foundry UI work, follow the **Foundry ApplicationV2 UI standard** in
`AGENTS.md`. Use the documented v14 `ApplicationV2` APIs and verify that windows,
text areas, nested content, scrolling, and actions remain usable when resized.
When the owner confirms a PR was merged and its branch deleted, immediately follow
the **Post-merge completion work** policy in `AGENTS.md`. When that closes the last
issue in a milestone, also complete the entire **Milestone closeout** policy,
including README, roadmap, changelog, and directly authorized wiki updates. Do not
wait for a separate documentation reminder.
