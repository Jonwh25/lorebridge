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
5. Run `npm run package:foundry` and inspect `release/lorebridge.zip`.
6. Merge the release pull request into `main`.
7. Create and push the matching tag, such as `v0.1.1`.
8. Confirm the Release Foundry Module workflow publishes:
   - `module.json`
   - `lorebridge.zip`
9. Install or update LoreBridge through Foundry using the stable manifest URL.

## Archive layout

`lorebridge.zip` must contain these files at its root:

```text
module.json
dist/main.js
styles/lorebridge.css
```

The archive must not wrap these files in an additional `lorebridge/` directory.

## Creating the tag

From an up-to-date local `main` branch:

```bash
git checkout main
git pull
git tag v0.1.1
git push origin v0.1.1
```

The release workflow rejects a tag that does not match the version in `module.json`.
