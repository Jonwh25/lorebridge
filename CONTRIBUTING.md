# Contributing to LoreBridge

LoreBridge is at an early stage. Changes should remain small, understandable, and directly tied to the documented roadmap.

## Development principles

- Protect campaign data before adding convenience.
- Prefer narrow, explicit tools over generic access methods.
- Keep AI-provider logic separate from Foundry access logic.
- Never add arbitrary code execution or unrestricted document invocation.
- Add validation and tests for every externally supplied input.
- Avoid logging credentials, document contents, or other sensitive campaign data unless explicitly required and safely controlled.

## Workflow

1. Create or select a GitHub issue describing the change.
2. Create a short-lived branch from `main`.
3. Make the smallest change that satisfies the issue.
4. Add or update tests and documentation.
5. Run formatting, linting, type checking, and tests.
6. Open a pull request explaining the behavior and security impact.

Direct commits to `main` may be used during initial repository scaffolding. Once the workspace and CI are established, normal development should use pull requests.

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
