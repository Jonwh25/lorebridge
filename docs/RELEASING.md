# Releasing LoreBridge

LoreBridge is installed and updated through Foundry VTT using this stable manifest URL:

```text
https://github.com/Jonwh25/lorebridge/releases/latest/download/module.json
```

## Versioning

LoreBridge uses semantic versioning:

- Patch (`0.1.1` to `0.1.2`): bug fixes and small internal changes
- Minor (`0.1.1` to `0.2.0`): new capabilities or meaningful features
- Major (`0.x` to `1.0.0`): stable public release or breaking compatibility change

The following versions must match before a release:

- root `package.json`
- `packages/foundry-module/package.json`
- `packages/foundry-module/module.json`
- Git tag, prefixed with `v`

The manifest download URL must include the same version.

## Release checklist

1. Move completed entries from `Unreleased` into a dated section in `CHANGELOG.md`.
2. Update all synchronized version fields.
3. Run `npm install`.
4. Run `npm run validate`.
5. Run `npm run package:foundry`, run
   `node scripts/verify-release-archive.mjs`, and inspect
   `release/lorebridge.zip`.
6. Merge the milestone closeout and release-preparation pull request into `main`.
7. After confirming the merge, run the pre-tag readiness guard from the resulting
   `main` commit. The coding agent provides the exact version-specific guard
   command; the owner runs the two annotated-tag commands printed by a passing
   guard. The coding agent does not push the tag.
8. Treat the pushed tag as the publication trigger. Do not manually create a
   duplicate GitHub release.
9. Confirm the Release Foundry Module workflow publishes:
   - `module.json`
   - `lorebridge.zip`
10. Verify the release URL, archive layout, manifest URLs, checksums, and published
    version.
11. Install or update LoreBridge through Foundry using the stable manifest URL.

## Archive layout

`lorebridge.zip` must contain these files at its root:

```text
module.json
dist/main.js
styles/lorebridge.css
```

The archive must not wrap these files in an additional `lorebridge/` directory.

## Pre-tag readiness and creating the tag

Run the guard from the merged release-preparation commit on `main`:

```bash
npm run release:check -- <version>
```

The guard is read-only with respect to the checkout and releases: it does not
reset files, create a tag, or push. It ignores untracked files but rejects any
tracked modification, fetches `origin`, requires `HEAD` to equal `origin/main`,
rejects an existing local or remote version tag, validates all synchronized
release metadata, and runs the validation and archive gates. It prints the two
exact tag commands only after every check passes.

The coding agent gives the repository owner this block with the real release
version substituted for `<version>`. The owner runs it from the live checkout:

```bash
cd /data/lorebridge
git fetch origin
git checkout main
git pull --ff-only
npm run release:check -- <version>
```

If the guard passes, it prints tag and push commands bound to the exact commit it
validated. Run those printed commands without modifying the checkout. If the
guard fails, stop and correct the reported condition; no tag commands are shown.

The release workflow rejects a tag that does not match the version in `module.json`.
The coding agent must not run these tag commands or manually create the GitHub
release. Create the tag only after the release-preparation pull request is merged.
Never tag an unmerged branch, move an existing tag, overwrite a tag, or reuse a
published version.
