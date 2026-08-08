# Claude Code instructions

Read and follow [`AGENTS.md`](AGENTS.md) and
[`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) before making
changes.

Those files are the canonical LoreBridge workflow. Do not invent a separate
Claude-specific process.
After every push to a pull request, follow the **GitHub Actions completion gate**
in `docs/DEVELOPMENT_WORKFLOW.md`. Proactively watch the checks for the current
head commit, inspect failed logs, fix and repush in-scope failures, and watch the
replacement run. Do not report the work ready while checks are pending or failing,
and do not wait for the owner to ask you to inspect Actions.
When creating GitHub issues, follow the **GitHub issue creation** policy in
`AGENTS.md`, including its labeling, assignment, milestone, and verification
requirements.
After implementing code, follow the **Live testing handoff** policy in
`AGENTS.md`. Always provide the tailored commands and manual acceptance test; do
not wait for the user to ask for testing instructions.
Before giving PM2, backend environment, or Azure deployment commands, read
[`docs/LIVE_DEPLOYMENT.md`](docs/LIVE_DEPLOYMENT.md). Treat its paths and PM2
ecosystem config as canonical, distinguish code restarts from environment reloads,
and never assume a numeric PM2 process id.
For Foundry UI work, follow the **Foundry ApplicationV2 UI standard** in
`AGENTS.md`. Use the documented v14 `ApplicationV2` APIs and verify that windows,
text areas, nested content, scrolling, and actions remain usable when resized.
When the owner confirms a PR was merged and its branch deleted, immediately follow
the **Post-merge completion work** policy in `AGENTS.md`. When that closes the last
issue in a milestone, also complete the entire **Milestone closeout** policy,
including README, roadmap, changelog, directly authorized wiki updates, synchronized
version changes, release packaging, and the closeout/release-preparation PR. Do not
wait for a separate documentation or release-preparation reminder. After the owner
merges that PR, provide the exact version-specific tag commands required by the
**Milestone release** policy in `AGENTS.md`; do not push the tag yourself.
