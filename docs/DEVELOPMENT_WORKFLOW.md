# LoreBridge development workflow

This document defines how LoreBridge is planned, implemented, tested, reviewed,
and released. It applies equally to human contributors and coding assistants.

## Sources of truth

- GitHub Issues describe the work and its acceptance criteria.
- The LoreBridge GitHub Project records priority and workflow state.
- Milestones group related outcomes.
- Repository documentation describes the current architecture and policies.
- Pull requests contain the implementation and validation record.

Do not maintain a competing backlog in chat, local notes, or another tracker.
Azure DevOps may later provide pipelines, test plans, or artifacts, but GitHub
remains the product backlog unless the project explicitly decides otherwise.

## Workflow states

Use the project `Workflow` field consistently:

1. **Backlog** — captured but not selected.
2. **Ready** — sufficiently defined and available to start.
3. **In Progress** — active implementation.
4. **Testing** — merged or deployable and awaiting live acceptance.
5. **Done** — acceptance criteria passed and the issue is complete.

The standard GitHub Project `Status` field should agree with the workflow state
where practical.

## Starting work

1. Select one Ready issue.
2. Read its scope, exclusions, dependencies, and acceptance test.
3. Move it to In Progress.
4. Update local `main`.
5. Create a short-lived branch named `agent/<short-description>` or another
   clearly scoped branch name.
6. Inspect the current implementation before proposing a new structure.

Keep the change narrow. If new work is useful but outside scope, create or update
a backlog issue rather than expanding the active pull request.

## Architecture rules

LoreBridge uses vertical slices. A new remote capability normally includes:

1. Shared protocol types, declarations, and runtime validation.
2. Foundry-side data access and normalization.
3. Registration with the authenticated Foundry adapter.
4. Backend routing through the connected adapter session.
5. An MCP tool when the capability is intended for external AI clients.
6. Tests at each affected boundary.
7. Changelog or documentation updates where appropriate.

Follow the architecture already present in the repository. Do not add layers,
services, or abstractions merely because they appeared in an earlier proposal.

## Foundry rules

- Target Foundry VTT v14 until the roadmap changes.
- Use documented public Foundry APIs. Check the official v14 API documentation
  when working with a new document type.
- Do not depend on private members or deprecated compatibility APIs.
- Prefer stable IDs and UUIDs in returned data.
- Return normalized JSON, never live Foundry Document instances.
- Keep search results lightweight and retrieval focused.
- Bound result counts and large text fields.
- Do not return raw system data or embedded documents unless an issue defines a
  reviewed, bounded contract for them.
- Maintain GM authorization and existing feature gates.

## Security and privacy

- Read-only is the default.
- Provider API keys and other upstream secrets belong on the backend, never in
  Foundry settings or browser code.
- A Foundry pairing token must be scoped, replaceable, and treated as sensitive.
- Never log credentials or unnecessary campaign contents.
- Never add arbitrary JavaScript execution.
- Writes require a separate design with explicit enablement, preview, narrow
  targeting, GM approval, conflict checks, and auditability.
- Clearly distinguish GM-only and future player-safe content modes.

## Compatibility and documentation

- Do not assume Linux, Azure, PM2, Caddy, a particular username, or a directory
  such as `/data/lorebridge` is mandatory.
- Use placeholders such as `<LOREBRIDGE_DIR>` in general instructions.
- Label environment-specific commands as examples.
- When giving Linux editing instructions to the repository owner, use `vi`.
- Keep the README product-focused. Installation and operational runbooks belong
  in the Wiki or dedicated documentation.

## Validation

Run:

```text
npm install
npm run validate
```

Add focused tests for:

- shared contract acceptance and rejection
- Foundry normalization and authorization
- backend authentication and adapter routing
- MCP tool discovery, input, output, and errors

GitHub Actions must pass. Ubuntu validation is the authoritative deployment check
for the maintainer's current server. Windows-only sandbox failures should be
documented accurately and must not be mislabeled as code failures.

## Pull requests

Open a draft pull request after the branch is pushed. Its description must
include:

- linked issue
- behavior added or changed
- deliberate exclusions
- security and privacy impact
- validation performed
- manual acceptance steps
- compatibility or migration notes

Mark the pull request ready only after CI passes. The repository owner decides
when to merge.

## Deployment and acceptance

After merge:

1. Update the Ubuntu checkout from `main`.
2. Run validation.
3. Build and restart only the components affected by the change.
4. For an unreleased Foundry-module change, deploy the development bundle
   manually while preserving a recoverable backup outside the module directory.
5. Reload Foundry and confirm the authenticated adapter connection.
6. Perform the issue's live acceptance test through the intended end-to-end
   path.
7. Record the result on the issue.
8. Close the issue as completed and move it to Done.

Passing CI alone does not complete a user-facing capability.

### Deployment runbook (Ubuntu server)

Follow these steps in order every time. Do not combine or reorder them.

**Step 1 — Pull the branch or merge commit**

```bash
cd <LOREBRIDGE_DIR>
git fetch origin
git checkout <branch-or-main>
git pull
```

If you are testing a feature branch before merging, check out that branch
explicitly. Never assume the working directory is already on the right branch.

**Step 2 — Build each package separately**

Build packages one at a time. Do not pass multiple `-w` flags to a single
`npm run build` call — esbuild interprets extra arguments as additional input
files and fails.

If backend changed:

```bash
npm run build -w packages/backend
```

If the Foundry module changed:

```bash
npm run build -w packages/foundry-module
```

If both changed (run sequentially):

```bash
npm run build -w packages/backend && npm run build -w packages/foundry-module
```

**Step 3 — Restart the backend**

```bash
pm2 restart lorebridge-backend
```

Confirm it is running cleanly:

```bash
pm2 logs lorebridge-backend --lines 20 --nostream
```

**Step 4 — Copy the Foundry module bundle**

```bash
cp <LOREBRIDGE_DIR>/packages/foundry-module/dist/main.js \
   <FOUNDRY_DATA_DIR>/Data/modules/lorebridge/dist/main.js
```

Step 4 must come after Step 2. You cannot copy a file that has not been built yet.

**Step 5 — Reload Foundry**

Hard-reload the Foundry browser tab (Ctrl+Shift+R or Cmd+Shift+R) to pick up
the new module bundle. Confirm the LoreBridge adapter reconnects in the pm2 logs.

**Step 6 — Run the acceptance test**

Perform every step in the issue's acceptance test. Record the result on the
issue before closing it.

## Release policy

Do not bump the Foundry module version for every incremental pull request.

Instead:

1. Merge small, tested capabilities into `main`.
2. Verify them through development deployment.
3. Group a meaningful set of verified changes.
4. Prepare a dedicated release pull request that updates every required version,
   manifest URL, lockfile entry, and changelog section.
5. Merge the release preparation before creating its tag.
6. Tag the correctly versioned `main` commit and let the release workflow build
   the official artifact.
7. Update through Foundry and run a post-release smoke test.

Never create the release tag before the version-preparation commit is merged.

## Git safety

- Inspect `git status` and the diff before staging.
- Preserve unrelated user changes.
- Stage only files in scope.
- Do not use destructive resets or cleanup commands without explicit approval.
- Do not force-push or rewrite shared history unless the owner explicitly
  requests it.
- Do not merge your own pull request unless the owner explicitly asks.

## Definition of done

A feature is Done only when:

- its issue scope is satisfied
- contracts and boundaries are documented
- relevant automated tests pass
- GitHub Actions passes
- the pull request is merged
- deployment validation passes
- the live acceptance test succeeds
- the acceptance evidence is recorded on the issue
- project workflow and issue state are updated

