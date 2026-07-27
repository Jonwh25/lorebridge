# Settings and Provider Security

LoreBridge uses Foundry world settings for feature toggles and non-secret connection metadata only.

## Foundry settings

The initial settings foundation exposes GM-controlled world settings for:

- enabling or disabling the LoreBridge capability API
- enabling or disabling external AI-provider integration
- selecting a provider
- configuring the LoreBridge backend URL

Foundry's `game.settings.register` API is the correct mechanism for these initial settings. A dedicated settings submenu may be added later with `game.settings.registerMenu` when conditional fields, connection testing, and pairing status are needed.

## Secrets

Provider API keys must not be stored in Foundry world settings, browser local storage, source code, module bundles, or chat messages.

The Foundry module runs in a browser client. Any secret embedded in that client can be inspected with browser developer tools. Provider secrets therefore belong in the LoreBridge backend process environment or another server-side secret store.

Example backend environment variable:

```bash
OPENAI_API_KEY=...
```

The Foundry module should authenticate to the LoreBridge backend using a limited LoreBridge session or pairing credential rather than receiving the provider API key directly.

## Planned flow

```text
Foundry settings
  - Enable AI integration
  - Provider: OpenAI
  - LoreBridge backend URL
            |
            v
LoreBridge backend
  - Stores provider secret server-side
  - Authenticates Foundry sessions
  - Dispatches approved capabilities
            |
            v
OpenAI API
```

## Initial milestone

The first settings milestone intentionally does not call an AI provider. It establishes safe configuration boundaries and feature toggles before transport and authentication are implemented.
