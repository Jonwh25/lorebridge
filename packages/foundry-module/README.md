# LoreBridge Foundry Module

This package contains the Foundry VTT side of LoreBridge.

## Current behavior

Version `0.1.0` is deliberately read-only. When a Foundry v14 world reaches the `ready` lifecycle hook, the module:

- exits immediately for non-GM users;
- reads basic world metadata and document counts;
- writes the summary to the browser console;
- displays a small GM notification; and
- exposes a temporary development helper at `globalThis.LoreBridge.getWorldSummary()`.

It does not connect to the internet or modify Foundry documents.

## Build

From the repository root:

```bash
npm install
npm run build:foundry
```

The compiled entry point is written to:

```text
packages/foundry-module/dist/main.js
```

## Development installation

After building, place or symlink `packages/foundry-module` into the Foundry v14 data directory:

```text
Data/modules/lorebridge
```

The installed folder must contain `module.json`, `dist/main.js`, and `styles/lorebridge.css`.

Enable **LoreBridge** in a test world, log in as a GM, and inspect the browser developer console.
