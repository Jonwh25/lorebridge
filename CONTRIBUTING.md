# Contributing to LoreBridge

LoreBridge is at an early stage. Changes should remain small, understandable, and directly tied to the documented roadmap.

The canonical planning, implementation, validation, acceptance, and release
process is documented in
[`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md). Coding assistants
must also read [`AGENTS.md`](AGENTS.md).

## Development principles

- Protect campaign data before adding convenience.
- Prefer narrow, explicit tools over generic access methods.
- Keep AI-provider logic separate from Foundry access logic.
- Never add arbitrary code execution or unrestricted document invocation.
- Add validation and tests for every externally supplied input.
- Avoid logging credentials, document contents, or other sensitive campaign data unless explicitly required and safely controlled.

## Workflow

1. Create or select a GitHub issue describing the change.
2. Move its project workflow to In Progress.
3. Create a short-lived branch from `main`.
4. Implement the smallest complete vertical slice that satisfies the issue.
5. Add or update tests and documentation.
6. Run `npm run validate`.
7. Open a pull request explaining behavior, exclusions, security impact, and
   manual acceptance unless the complete change qualifies for the Markdown-only
   exception below.
8. After merge, complete the live acceptance test before closing the issue.

Normal development uses pull requests. A documentation-only change may instead
be committed and pushed directly to `main` when every changed file ends in
`.md`. Update `main` first, inspect the complete diff, stage only the intended
Markdown files, verify affected links and instructions, and use a narrow
documentation commit. If any code, manifest, package, lock, workflow,
configuration, generated, or other non-Markdown file changes, keep the complete
logical change on a short-lived branch and use a pull request.

## Commit messages

Use concise conventional-style messages where practical:

- `feat: add world information tool`
- `fix: reject non-GM bridge requests`
- `docs: explain module installation`
- `test: add journal search schema fixtures`
- `chore: configure TypeScript workspace`

## Pull requests

A pull request should include:

- what changed
- why it changed
- how it was tested
- any security or privacy impact
- screenshots for user-interface changes
- migration or compatibility notes when applicable

## Security issues

Do not publish exploitable security findings in a public issue. Until a dedicated security policy and private reporting path are configured, contact the repository owner directly through GitHub.

## Compatibility

The first target is Foundry VTT v14. Code should avoid undocumented Foundry internals when a supported public API exists.

## License

By contributing, you agree that your contributions will be licensed under the MIT License used by this repository.
