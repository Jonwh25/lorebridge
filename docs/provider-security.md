# Provider Configuration and Secret Boundary

LoreBridge separates Foundry world configuration from provider credentials.

## Foundry stores

- whether the local capability API is enabled
- whether remote AI integration is enabled
- the selected backend provider label
- the LoreBridge backend WebSocket URL
- a future revocable LoreBridge pairing or session credential

## Foundry does not store

- OpenAI API keys
- Claude or Gemini provider secrets
- backend service credentials with broad administrative access
- secrets embedded in module source or the browser bundle

Foundry modules execute in the browser. Values available to the module can be inspected by the GM browser session and may be accessible to other client-side code. Provider secrets therefore belong in the LoreBridge backend environment or another server-side secret store.

## Intended connection model

```text
AI assistant or MCP client
        |
LoreBridge backend
  - provider credentials
  - authentication
  - permissions
  - audit and rate limits
        |
WebSocket connection
        |
Foundry LoreBridge adapter
  - approved capabilities only
  - GM/world feature toggles
  - no provider secrets
```

A future pairing flow should issue a revocable, limited credential scoped to a specific LoreBridge backend and Foundry world. It must not be usable as a provider API key.

## High-risk features

Write operations, destructive operations, script macros, and arbitrary code execution must remain disabled by default and require separate, explicit authorization controls.
