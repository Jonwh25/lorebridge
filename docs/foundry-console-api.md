# Foundry Browser Console API

LoreBridge currently exposes a temporary, GM-only browser API for local development and verification. This API will eventually be replaced by an authenticated dispatcher used by the LoreBridge service and MCP adapter.

## Inspect the API

In a Foundry world, open the browser developer console and run:

```js
globalThis.LoreBridge
```

The object exposes:

- `version`: current Foundry module version
- `moduleVersion`: current Foundry module version
- `protocolVersion`: current LoreBridge protocol version
- `capabilities`: approved capability declarations
- `getWorldSummary()`: normalized, read-only world summary

Module and protocol versions are intentionally independent. A Foundry packaging or adapter fix can increment the module version without changing the LoreBridge protocol.

## Get a world summary

As a GM:

```js
await LoreBridge.getWorldSummary()
```

Example response:

```js
{
  source: {
    sourceId: "foundry:cos",
    adapterType: "foundry"
  },
  world: {
    id: "cos",
    title: "Curse of Strahd",
    foundryVersion: "14.365"
  },
  system: {
    id: "dnd5e",
    title: "Dungeons & Dragons Fifth Edition",
    version: "5.3.3"
  },
  counts: {
    actors: 686,
    scenes: 624,
    journals: 842,
    installedModules: 7,
    activeModules: 7
  }
}
```

The result contains normalized strings and numbers only. It does not return Foundry documents, collections, or executable objects.

## Errors

Capability failures throw `LoreBridgeCapabilityError`, which contains:

```js
{
  name: "LoreBridgeCapabilityError",
  code: "NOT_AUTHORIZED",
  message: "LoreBridge getWorldSummary requires an active GM user.",
  retryable: false
}
```

Current relevant error codes:

- `NOT_AUTHORIZED`: the active Foundry user is not a GM
- `ADAPTER_UNAVAILABLE`: Foundry is absent or the world is not fully initialized
- `INTERNAL_ERROR`: LoreBridge could not produce a schema-valid normalized result

Non-GM users are rejected before campaign summary data is assembled.
