# LoreBridge agent instructions

Before changing this repository, read:

1. [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md)
2. [`CONTRIBUTING.md`](CONTRIBUTING.md)
3. The GitHub issue selected for the change

Before giving deployment or live-test commands for the repository owner's Azure
host, also read [`docs/LIVE_DEPLOYMENT.md`](docs/LIVE_DEPLOYMENT.md).

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
- After every PR push, follow the **GitHub Actions completion gate** in
  `docs/DEVELOPMENT_WORKFLOW.md`: watch checks for the current head commit,
  inspect failures, fix in-scope problems, push, and watch again until all
  required checks pass or a genuine blocker is documented.
- Never call a PR ready or complete while required Actions checks are pending,
  cancelled, or failing. Do not wait for the owner to remind you to inspect CI.
- Do not close the issue until the merged change passes its live acceptance
  test.
- Do not increment the product version for every merged feature. Group verified
  incremental work into intentional releases.
## GitHub issue creation

Whenever creating a GitHub issue:

- Assign it to `Jonwh25`.
- Add exactly one priority label.
- Add `enhancement`, `bug`, or `documentation` as appropriate.
- Add every relevant `area:*` label.
- Assign Claude only if its GitHub account is available as an assignee.
- Add the appropriate milestone when known.
- Verify the issue after creation.
- Never leave a newly created issue unlabeled or unassigned.
## Live testing handoff

The repository checkout used for live testing is `/data/lorebridge`. The installed
Foundry module is `/data/foundrydata/Data/modules/lorebridge`.

After completing an implementation, end the response with a **Live test commands**
section containing a single copyable shell block. Include only the commands needed
for that specific change; do not dump the full command menu. Use the actual feature
branch name in place of `<feature-branch>`.

Start from these synchronization commands:

```sh
cd /data/lorebridge
git fetch origin
git checkout <feature-branch>
git pull
```

Select additional commands according to the files changed:

- Run `npm install` only when dependencies or lockfiles changed, or when the user
  must install dependencies for the first test run.
- Run `npm run validate` for every code change.
- Run `npm run build -w packages/shared` when the shared package changed.
- Run `npm run build -w packages/backend` when the backend changed or must consume
  a rebuilt shared package.
- Run `npm run build -w packages/foundry-module` when the Foundry module changed or
  must consume a rebuilt shared package.
- After building the Foundry module, copy only the generated artifacts needed for
  the change:

  ```sh
  cp packages/foundry-module/dist/main.js /data/foundrydata/Data/modules/lorebridge/dist/main.js
  cp packages/foundry-module/dist/main.js.map /data/foundrydata/Data/modules/lorebridge/dist/main.js.map
  ```

- Copy a changed Foundry template individually. The commonly deployed templates
  are:

  ```sh
  cp packages/foundry-module/templates/feature-settings.hbs /data/foundrydata/Data/modules/lorebridge/templates/feature-settings.hbs
  cp packages/foundry-module/templates/configuration.hbs /data/foundrydata/Data/modules/lorebridge/templates/configuration.hbs
  ```

- For a backend code-only change, run `pm2 restart lorebridge-backend` only when
  backend runtime code or its built shared dependency changed.
- When backend environment variables or the server-owned PM2 ecosystem config
  changed, reload from the canonical config path as documented in
  [`docs/LIVE_DEPLOYMENT.md`](docs/LIVE_DEPLOYMENT.md). Do not substitute a
  name-only restart with `--update-env`, and do not delete/recreate the process.
- When the backend is restarted or reloaded, follow it with
  `pm2 logs lorebridge-backend --lines 20 --nostream`.
- After the command block, state the shortest relevant manual acceptance test in
  Foundry. Do not repeat setup steps unrelated to the completed change.
## Foundry ApplicationV2 UI standard

For new or substantially rewritten Foundry interfaces, use the documented
Foundry VTT v14 `ApplicationV2` APIs. Do not introduce a legacy `Application`
implementation unless the selected issue explicitly requires legacy compatibility
and explains why. Follow the public v14 API documentation rather than copying an
older application pattern from the repository.

Every new window, dialog, sheet, or workspace must remain usable when resized:

- Make the application window resizable unless a fixed size is essential to the
  interaction.
- Treat configured width and height as initial dimensions, not hard layout limits.
- Use flexible grid or flex layouts. Avoid fixed child widths and heights that can
  overflow the application viewport.
- Ensure controls and content can shrink correctly, including appropriate
  `min-width: 0` and `min-height: 0` behavior for nested flex/grid children.
- Keep inputs, selects, buttons, editors, and text areas within the visible window
  at supported sizes.
- Make multiline text areas user-resizable, normally with vertical resizing, and
  give them a useful minimum height.
- Give long content regions explicit, usable overflow scrolling. A nested region
  that can exceed the available height must be able to scroll or be resized; its
  content must not become clipped or unreachable.
- Keep primary actions reachable without relying on content overflowing outside
  the window.
- Test the interface at its initial size, at a smaller practical size, and after
  enlarging it. Verify text-area resizing, nested scrolling, and action visibility.

When handing off a UI change for live testing, include these resize and overflow
checks in the manual Foundry acceptance test.
## Post-merge completion work

Post-merge documentation and tracking are required delivery work, not optional
cleanup. Treat them as equally important as implementation and release work.

When the repository owner says that a feature PR has been merged and its branch
has been deleted:

1. Re-read the merged PR, the selected issue, and the final changed-file list.
2. Ensure the issue documents the complete delivered scope. Update its checklist or
   body when needed, and add a concise completion comment covering:
   - the merged PR;
   - what was implemented;
   - important design or safety decisions;
   - validation and live acceptance results actually reported;
   - documentation changes; and
   - any explicit follow-up work or known limitations.
3. Do not claim an unreported live test passed. If live acceptance has not been
   confirmed, record what remains and keep the issue open.
4. Once the merged change has passed its required live acceptance test, mark the
   issue complete in `ROADMAP.md`, close the GitHub issue, and verify the roadmap,
   issue, PR, and milestone agree.
5. Repository-file updates still use a short-lived documentation branch and pull
   request. Do not commit these updates directly to `main`.

After closing an issue, inspect every issue assigned to the same milestone. If any
remain incomplete, report which ones remain and stop the milestone closeout there.

## Milestone closeout

When all issues in a milestone are implemented, merged, live-tested, documented,
and closed, complete all of the following before calling the milestone complete or
release-ready:

1. Update `README.md` for user-visible capabilities, setup changes, configuration,
   supported workflows, or other current behavior introduced during the milestone.
2. Update `ROADMAP.md` so every completed milestone issue has a checkmark and the
   milestone itself is visibly marked complete.
3. Update `CHANGELOG.md` with a complete, user-focused summary of all changes in the
   milestone, including relevant fixes, safeguards, configuration changes, and
   upgrade notes. Derive this from the milestone issues and merged PRs; do not rely
   on memory.
4. Review the existing GitHub wiki and update every affected page. Add pages when
   needed so installation, configuration, operation, testing, troubleshooting, and
   user-facing behavior are accurate and discoverable.
5. Determine the next version according to the repository's versioning policy.
6. Update every synchronized version reference, manifest URL, package file,
   lockfile entry, README reference, and changelog release heading.
7. Verify links, commands, paths, examples, milestone issue state, versions, and
   documentation agree with the shipped implementation.
8. Run the complete release validation in `docs/RELEASING.md`, package the Foundry
   module, and inspect the release archive.
9. Create one short-lived milestone closeout and release-preparation pull request
   containing the repository documentation and version changes. Monitor its
   GitHub Actions checks through completion.
10. Let the repository owner merge that pull request, then close the GitHub
    milestone object only after its issues and closeout documentation are complete.

The LoreBridge wiki repository is:

```text
https://github.com/Jonwh25/lorebridge.wiki.git
```

The repository owner grants standing permission to clone, edit, commit, and push
LoreBridge wiki documentation directly without requesting separate approval each
time. Keep wiki commits narrowly scoped to verified documentation changes. This
permission applies only to the wiki repository and does not override the pull
request workflow for the main `lorebridge` repository.

## Milestone release

Preparing the version and release pull request is part of milestone closeout. The
repository owner retains control of the final tag push that starts publication.

After confirming the milestone closeout and release-preparation PR is merged:

1. Resolve the exact released version from the synchronized files on `main`.
2. Tell the repository owner that the release is ready to tag and provide this
   copyable command block with `<version>` replaced everywhere by the exact version;
   never leave placeholders in the handoff:

   ```sh
   cd /data/lorebridge
   git fetch origin
   git checkout main
   git pull --ff-only
   git tag -a v<version> -m "LoreBridge v<version>"
   git push origin v<version>
   ```

3. Do not run the tag commands for the owner and do not create the GitHub release
   manually. Wait for the owner to confirm the tag was pushed.
4. After confirmation, treat the pushed tag as the release trigger. Monitor the
   tag-triggered release workflow through completion.
5. Verify the GitHub release, module archive, manifest URLs, checksums, and
   published version, then report the release URL and any incomplete step.

Never tag an unmerged feature, documentation, or release branch. Never move,
overwrite, or reuse an existing release tag.
