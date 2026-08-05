# LoreBridge agent instructions

Before changing this repository, read:

1. [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md)
2. [`CONTRIBUTING.md`](CONTRIBUTING.md)
3. The GitHub issue selected for the change

The development workflow is authoritative for Codex, Claude, other coding
assistants, and human contributors.

Important rules:

- Work from a GitHub issue and keep its project status current.
- Use a short-lived branch from `main`; do not commit feature work directly to
  `main`.
- Preserve the existing architecture and implement complete vertical slices.
- Use documented public Foundry VTT v14 APIs - https://foundryvtt.com/api/v14/
- Keep remote access read-only, GM-authorized, bounded, and source-attributed
  unless an issue explicitly introduces an approved write design.
- Never store AI-provider secrets in Foundry or expose arbitrary JavaScript
  execution.
- Add tests and run `npm run validate`.
- Open a pull request and let the repository owner merge it.
- Do not close the issue until the merged change passes its live acceptance
  test.
- Do not increment the product version for every merged feature. Group verified
  incremental work into intentional releases.

