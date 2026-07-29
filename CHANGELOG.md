# Changelog

All notable changes to LoreBridge are documented here.

## [Unreleased]

### Added

- An authenticated WebSocket session between a paired Foundry GM client and the LoreBridge backend.
- Live adapter registration for the active Foundry world and its read-only capabilities.

### Changed

- Remote integration no longer requires selecting an AI provider; LoreBridge remains client- and provider-neutral.

### Fixed

### Security

## [0.1.6] - 2026-07-29

### Added

- Shared, Foundry, and backend support for focused `getJournalPage` retrieval.
- An authenticated journal-page API route that returns one page and its parent journal reference.

## [0.1.5] - 2026-07-29

### Added

- Shared `searchJournals` and `getJournal` capability contracts and validators.
- GM-only Foundry v14 journal search and normalized journal retrieval.
- Authenticated backend journal HTTP routes backed by an injected journal service.
- Shared, Foundry-adapter, and backend API tests for the journal vertical slice.

## [0.1.4] - 2026-07-26

### Added

- GM/world-scoped Foundry settings for capability exposure, remote integration, provider selection, and backend URL.
- Runtime policy tests covering GM-only and disabled capability API behavior.
- Provider configuration security guidance that keeps provider secrets out of the Foundry browser.

### Changed

- The LoreBridge browser API now respects the world-level capability enable toggle.
- Remote AI configuration is provider-neutral and reports incomplete configuration without opening a connection.

### Security

- OpenAI and other provider API keys are explicitly excluded from Foundry settings and bundled client code.

## [0.1.3] - 2026-07-26

### Fixed

- The browser API now reads the installed module version from Foundry instead of using a hardcoded release number.

## [0.1.2] - 2026-07-26

### Added

- Automated Foundry-adapter tests for GM access, non-GM rejection, and unavailable runtime state.
- Browser-console documentation for the temporary LoreBridge development API.
- Structured capability errors with LoreBridge protocol error codes.
- Official Foundry manifest links for the license, readme, issue tracker, and changelog.

### Changed

- `getWorldSummary` now validates its normalized result against the shared runtime schema before returning it.
- Initialization logging now identifies both the Foundry module version and LoreBridge protocol version.

### Fixed

- Non-GM calls no longer throw an unstructured generic error.
- Unavailable or incomplete Foundry runtime state now produces a retryable adapter error.

### Security

- Non-GM users are rejected before campaign summary data is assembled or returned.

## [0.1.1] - 2026-07-26

### Added

- Browser-safe Foundry module bundling with esbuild.
- Automated Foundry packaging and GitHub Release workflow.
- Stable Foundry manifest URL for installation and update checks.

### Fixed

- Bundled shared LoreBridge contracts so Foundry no longer receives unresolved `@lorebridge/shared` browser imports.

## [0.1.0] - 2026-07-26

### Added

- Initial Foundry v14 module foundation.
- GM-only `getWorldSummary` capability.
- Shared LoreBridge protocol v0.1 contracts and validation.
