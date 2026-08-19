---
name: milestone-closeout
description: Full milestone closeout and release-preparation for LoreBridge. Run only when all issues in the milestone are implemented, merged, live-tested, documented, and closed.
---

# Milestone closeout

All issues in the milestone are confirmed closed. Work through every step below before calling the milestone complete or release-ready.

## Pre-flight check

Confirm the milestone is actually ready:

```
gh issue list --milestone "<milestone-name>" --state open
```

If any open issues appear, **stop** and report them. Do not proceed until they are resolved.

---

## Step 1 — Update README.md

Update `README.md` for any user-visible changes introduced during the milestone:

- New capabilities or workflows.
- Setup or configuration changes.
- Changed supported behavior.
- Any section that would mislead a reader based on the current codebase.

## Step 2 — Update ROADMAP.md

- Ensure every completed milestone issue has a checkmark.
- Mark the milestone itself as visibly complete (e.g., add a completion note or strike the header).

## Step 3 — Update CHANGELOG.md

Add a new version section at the top of `CHANGELOG.md` with a complete, user-focused summary:

- Derive entries from the milestone issues and merged PRs — do not rely on memory.
- Include: new features, fixes, safeguards, configuration changes, and upgrade notes.
- Use the version determined in Step 5 as the release heading.

> You may need to determine the version first (Step 5) before finalizing the heading. Write the content first and fill in the heading after.

## Step 4 — Update the wiki

Clone the wiki if not already present:

```
git clone https://github.com/Jonwh25/lorebridge.wiki.git
```

Review every existing wiki page that touches areas changed in the milestone. Update or add pages so that installation, configuration, operation, testing, troubleshooting, and user-facing behavior are accurate and discoverable.

Commit and push wiki changes directly (standing permission granted in `AGENTS.md`). Keep wiki commits narrowly scoped.

## Step 5 — Determine the next version

Read the repository's versioning policy and the current version from:

- `package.json` (root)
- `packages/foundry-module/package.json`
- `packages/foundry-module/module.json` (`version` field)
- `packages/foundry-module/module.json` (`download` URL — must match version)

Decide the next version number according to semver and the scope of the milestone's changes.

## Step 6 — Synchronize all version references

Update the version in **all four locations** listed above so they agree exactly. Also update:

- The `download` URL in `module.json` (replace the old version string in the URL).
- Any README badge or version reference.
- The `CHANGELOG.md` release heading if not already set.

Run `npm install` after package file changes to update lockfile entries, then commit the lockfile.

## Step 7 — Verify consistency

Read through the following and confirm they agree:

- Links, commands, and paths in docs reflect the shipped implementation.
- All milestone issues are closed and checkmarked in the roadmap.
- Versions in all four locations match.
- CHANGELOG heading matches the version.
- Wiki pages reflect current behavior.

## Step 8 — Run release validation and package

Follow the complete release validation checklist in [`docs/RELEASING.md`](../docs/RELEASING.md):

- Run all validation steps documented there.
- Package the Foundry module.
- Inspect the release archive to confirm it is complete and correct.

## Step 9 — Create the closeout PR

Create one short-lived branch for all milestone closeout and release-preparation changes:

```
git checkout -b chore/vX.Y.Z-release-prep
```

Stage all changed files (documentation, version bumps, lockfile), commit with a clear message, push, and open a PR:

```
gh pr create --title "chore: vX.Y.Z release preparation" --body "..."
```

Monitor the PR's GitHub Actions checks through completion. Fix any failures before reporting to the owner.

## Step 10 — Hand off to the owner

Tell the owner:

1. The closeout PR is ready for review and merge.
2. After they merge it, provide the exact tag commands with `<version>` replaced by the real version — never leave placeholders:

```sh
cd /data/lorebridge
git fetch origin
git checkout main
git pull --ff-only
git tag -a vX.Y.Z -m "LoreBridge vX.Y.Z"
git push origin vX.Y.Z
```

3. Do **not** push the tag yourself and do not create the GitHub release manually.
4. After the owner confirms the tag was pushed, monitor the tag-triggered release workflow, then verify:
   - The GitHub release page exists.
   - The module archive downloads correctly.
   - Manifest URLs and checksums are correct.
   - The published version matches.

5. Close the GitHub milestone object only after all issues and closeout documentation are complete.

---

*Canonical policies: `AGENTS.md` §Milestone closeout, §Milestone release; `docs/RELEASING.md`.*
