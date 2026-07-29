# LoreBridge Internal Protocol v0.1

Status: Draft

LoreBridge uses a provider-independent internal protocol between LoreBridge Core and campaign-platform adapters. MCP, ChatGPT integrations, HTTP APIs, and other client interfaces sit outside this protocol and translate public client requests into LoreBridge capability requests.

## 1. Goals

The protocol must:

- keep LoreBridge Core independent of Foundry, LegendKeeper, Obsidian, and any AI provider
- let adapters advertise the capabilities they actually support
- provide stable request, response, event, and error shapes
- support version negotiation before normal traffic begins
- preserve source attribution through stable identifiers
- enforce read-only operation in the initial release
- allow controlled writes later without breaking existing readers
- work over multiple transports, including WebSocket or another persistent authenticated channel

## 2. Non-goals

Protocol v0.1 does not define:

- MCP tool schemas presented to an AI client
- a public REST API
- a specific network transport implementation
- a specific authentication vendor or identity provider
- direct access to platform database files
- arbitrary execution of platform methods or model-generated code

## 3. Participants

### LoreBridge Core

The central service that authenticates adapters, registers sources, negotiates capabilities, routes requests, validates messages, applies limits, and records audit events.

### Adapter

A narrow integration for one campaign platform or source. Examples include:

- Foundry VTT adapter
- LegendKeeper adapter
- Obsidian adapter
- transcript source adapter

An adapter translates LoreBridge capability requests into approved platform operations and converts platform data into LoreBridge documents.

### Client adapter

A boundary component such as an MCP adapter. It is not part of the internal adapter protocol. It translates external client requests into LoreBridge capability requests.

## 4. Protocol version

The initial protocol version is:

```text
0.1
```

Versions use `major.minor` form.

- A major change may be incompatible.
- A minor change must remain backward-compatible within the same major version.
- Both sides send supported versions during connection setup.
- LoreBridge Core selects one mutually supported version.
- If no compatible version exists, the session closes with `protocol_version_unsupported`.

## 5. Connection lifecycle

A normal adapter session follows this order:

1. Adapter opens an authenticated transport connection.
2. Adapter sends `hello` with identity, supported protocol versions, adapter metadata, and source metadata.
3. Core authenticates the connection and selects a protocol version.
4. Core sends `welcome` with the session identifier, selected version, limits, and policy state.
5. Adapter sends `capabilities` describing its supported operations.
6. Core validates and registers the source and capabilities.
7. Core sends `ready`.
8. Requests, responses, and events may flow.
9. Either side may send `goodbye` before closing gracefully.

Normal capability traffic must not begin before `ready`.

### Current transport implementation

The first implemented transport slice combines authentication, version
negotiation, source metadata, and capability advertisement in an
`adapter.hello` WebSocket message. The backend validates the signed pairing
token and replies with `adapter.welcome`, including the backend and session
identifiers. This smaller handshake is an incremental implementation of the
lifecycle above; capability traffic is not enabled yet.

The token is a limited LoreBridge pairing credential, never an AI-provider
credential. Public deployments must use `wss://`.

## 6. Adapter and source identity

Every connection identifies both the adapter implementation and the connected campaign source.

```json
{
  "adapter": {
    "id": "foundry-vtt",
    "version": "0.1.0",
    "instanceId": "01K1EXAMPLEADAPTER"
  },
  "source": {
    "id": "foundry:world:curse-of-strahd",
    "type": "foundry-world",
    "name": "Curse of Strahd",
    "platformVersion": "14",
    "systemId": "dnd5e",
    "systemVersion": "5.x"
  }
}
```

Rules:

- `adapter.id` identifies an adapter family.
- `adapter.instanceId` identifies one installation or running instance.
- `source.id` must be stable within that adapter installation.
- Core assigns the authenticated session ID.
- Display names are not identifiers.

## 7. Base message envelope

Every protocol message uses this base shape:

```ts
interface ProtocolMessage<TPayload = unknown> {
  protocol: "0.1";
  type: MessageType;
  messageId: string;
  timestamp: string;
  sessionId?: string;
  correlationId?: string;
  payload: TPayload;
}
```

Field rules:

- `messageId` is unique for every message.
- `timestamp` is an ISO 8601 UTC timestamp.
- `sessionId` is required after `welcome`.
- `correlationId` links a response, error, cancellation, or event to an earlier request when applicable.
- Unknown top-level fields must be ignored within the same major protocol version.

Recommended identifiers are UUIDv7 or ULID values.

## 8. Handshake messages

### `hello`

```json
{
  "protocol": "0.1",
  "type": "hello",
  "messageId": "01K1HELLO",
  "timestamp": "2026-07-26T23:00:00Z",
  "payload": {
    "supportedProtocolVersions": ["0.1"],
    "adapter": {
      "id": "foundry-vtt",
      "version": "0.1.0",
      "instanceId": "01K1ADAPTER"
    },
    "source": {
      "id": "foundry:world:curse-of-strahd",
      "type": "foundry-world",
      "name": "Curse of Strahd",
      "platformVersion": "14",
      "systemId": "dnd5e"
    }
  }
}
```

### `welcome`

```json
{
  "protocol": "0.1",
  "type": "welcome",
  "messageId": "01K1WELCOME",
  "timestamp": "2026-07-26T23:00:01Z",
  "sessionId": "01K1SESSION",
  "correlationId": "01K1HELLO",
  "payload": {
    "selectedProtocolVersion": "0.1",
    "mode": "read-only",
    "limits": {
      "requestTimeoutMs": 15000,
      "maximumPageSize": 100,
      "maximumResponseBytes": 1048576
    }
  }
}
```

### `ready`

Core sends `ready` after successful capability registration.

## 9. Capability negotiation

Adapters advertise capability descriptors rather than exposing raw platform methods.

```ts
interface CapabilityDescriptor {
  name: string;
  version: "1";
  access: "read" | "write";
  enabled: boolean;
  supportsPagination?: boolean;
  supportsSearch?: boolean;
  constraints?: Record<string, unknown>;
}
```

Example:

```json
{
  "protocol": "0.1",
  "type": "capabilities",
  "messageId": "01K1CAPS",
  "timestamp": "2026-07-26T23:00:02Z",
  "sessionId": "01K1SESSION",
  "payload": {
    "capabilities": [
      { "name": "getWorldSummary", "version": "1", "access": "read", "enabled": true },
      { "name": "listActors", "version": "1", "access": "read", "enabled": true, "supportsPagination": true },
      { "name": "searchJournals", "version": "1", "access": "read", "enabled": true, "supportsPagination": true, "supportsSearch": true },
      { "name": "createJournal", "version": "1", "access": "write", "enabled": false }
    ]
  }
}
```

Core exposes only capabilities that are:

- supported by the adapter
- enabled by the source owner or GM
- allowed by Core policy
- compatible with the selected protocol and capability version

Capability state may change during a session. The adapter sends `capabilitiesChanged` when that happens.

## 10. Capability requests

```ts
interface CapabilityRequest<TInput = unknown> {
  capability: string;
  capabilityVersion: "1";
  sourceId: string;
  input: TInput;
  options?: {
    timeoutMs?: number;
    pageSize?: number;
    cursor?: string;
  };
}
```

Example:

```json
{
  "protocol": "0.1",
  "type": "request",
  "messageId": "01K1REQUEST",
  "timestamp": "2026-07-26T23:01:00Z",
  "sessionId": "01K1SESSION",
  "payload": {
    "capability": "getActor",
    "capabilityVersion": "1",
    "sourceId": "foundry:world:curse-of-strahd",
    "input": {
      "actorId": "foundry:Actor:abc123"
    }
  }
}
```

Adapters must reject unknown, disabled, or unauthorized capabilities. They must never interpret a capability name as a platform method name.

## 11. Successful responses

```ts
interface CapabilityResponse<TResult = unknown> {
  capability: string;
  capabilityVersion: "1";
  sourceId: string;
  result: TResult;
  page?: {
    cursor?: string;
    nextCursor?: string;
    hasMore: boolean;
    returned: number;
  };
  warnings?: ProtocolWarning[];
}
```

Example:

```json
{
  "protocol": "0.1",
  "type": "response",
  "messageId": "01K1RESPONSE",
  "timestamp": "2026-07-26T23:01:01Z",
  "sessionId": "01K1SESSION",
  "correlationId": "01K1REQUEST",
  "payload": {
    "capability": "getActor",
    "capabilityVersion": "1",
    "sourceId": "foundry:world:curse-of-strahd",
    "result": {
      "id": "foundry:Actor:abc123",
      "documentType": "actor",
      "name": "Ireena Kolyana",
      "sourceRef": {
        "sourceId": "foundry:world:curse-of-strahd",
        "nativeId": "abc123"
      }
    }
  }
}
```

## 12. Errors

Errors use a stable code and a safe message.

```ts
interface ProtocolError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

Initial error codes:

- `authentication_failed`
- `authorization_denied`
- `protocol_version_unsupported`
- `invalid_message`
- `invalid_input`
- `source_not_found`
- `source_unavailable`
- `capability_not_supported`
- `capability_disabled`
- `document_not_found`
- `request_timeout`
- `request_cancelled`
- `rate_limited`
- `response_too_large`
- `conflict`
- `approval_required`
- `internal_error`

Error details must not contain secrets, tokens, stack traces, filesystem paths, or private platform internals.

## 13. Events

Adapters may send bounded events after readiness.

Initial event names include:

- `sourceStatusChanged`
- `capabilitiesChanged`
- `worldChanged`
- `documentChanged`
- `approvalStatusChanged`

Events are informational and must not be treated as proof that a later read will succeed. Clients should re-read authoritative state when needed.

## 14. Cancellation and timeouts

Core may send `cancel` with the original request's message ID as `correlationId`.

- Adapters should stop work when practical.
- A late response may be discarded by Core.
- Every request has an effective timeout.
- Adapter-specific platform calls must not run indefinitely.

## 15. Pagination

List and search capabilities use opaque cursors.

Rules:

- Clients must not parse or modify cursors.
- Page size is bounded by Core and adapter limits.
- Result order must be stable for the lifetime of a cursor where practical.
- A stale cursor returns `invalid_input` or `conflict` with a safe explanation.
- Responses must report `hasMore` and `returned`.

## 16. Response limits

Core communicates negotiated limits in `welcome`.

Protocol v0.1 defaults:

- maximum page size: 100 records
- maximum response size: 1 MiB
- default request timeout: 15 seconds

Implementations may choose lower limits. Oversized content should be paginated, summarized, or rejected with `response_too_large`; it must not be silently truncated without a warning.

## 17. Stable document identifiers

LoreBridge identifiers are opaque strings namespaced by adapter or source.

Examples:

```text
foundry:Actor:abc123
foundry:JournalEntry:def456
foundry:JournalEntryPage:ghi789
legendkeeper:page:01K1PAGE
```

Every returned document must include:

```ts
interface SourceReference {
  sourceId: string;
  nativeId: string;
  parentId?: string;
  path?: string;
  revision?: string;
}
```

The `nativeId` is included for adapter resolution but external clients should prefer the LoreBridge `id`.

## 18. Serialization rules

Adapters convert native records into capability-specific LoreBridge schemas.

General rules:

- use JSON-compatible values only
- use UTF-8 strings
- use ISO 8601 UTC timestamps
- preserve stable source references
- omit secrets and fields not approved for exposure
- distinguish absent values from empty values
- represent rich text as sanitized HTML and, where useful, normalized plain text
- never serialize executable functions or arbitrary platform objects
- include document type and name where available
- include revision or modified time when available

Platform-specific raw data may be included only in an explicitly versioned `extensions` object approved by the relevant capability schema.

## 19. Authentication and session expectations

The protocol is transport-independent, but every production session must provide:

- encrypted transport
- authenticated adapter identity
- authenticated Core identity where supported
- replay-resistant credentials or session establishment
- credential rotation and revocation
- secrets stored outside source control
- session expiration or re-authentication

The `hello` message identifies the adapter; it is not itself proof of identity. Authentication occurs at or below the transport/session layer.

## 20. Read-only policy

Protocol v0.1 launches in `read-only` mode.

Both Core and adapter must enforce this independently.

- Core must not route write requests when policy is read-only.
- Adapter must reject write capabilities even if a malformed or compromised Core requests one.
- Adapters advertise write capabilities as disabled until explicitly configured.
- No arbitrary document update operation exists.

## 21. Future controlled-write flow

A later protocol revision may support the following sequence:

1. Client requests a write capability.
2. Core requests a dry-run preview from the adapter.
3. Adapter returns the exact target, proposed change, warnings, and revision.
4. GM reviews and explicitly approves the proposal.
5. Core issues a short-lived, single-use confirmation token bound to the proposal.
6. Adapter verifies the token, target, revision, and expiry.
7. Adapter executes the narrow change.
8. Adapter returns a before-and-after summary and audit reference.

Approval tokens must never authorize arbitrary or broader changes than the preview.

## 22. Audit requirements

Core records:

- session and source identifiers
- capability name and version
- request and correlation IDs
- start and completion timestamps
- outcome and stable error code
- response size and duration
- approval references for writes

Logs must redact credentials and avoid storing full campaign content by default.

## 23. Foundry example capability set

A Foundry v14 adapter may advertise:

```text
getWorldSummary
listActors
getActor
listJournals
searchJournals
getJournal
listScenes
getScene
listCompendiums
searchCompendium
getCompendiumEntry
```

The adapter may additionally report platform features such as active combat or roll tables later, but only after corresponding public capabilities and schemas are defined.

## 24. LegendKeeper example capability set

A future LegendKeeper adapter might advertise:

```text
getWorldSummary
listJournals
searchJournals
getJournal
listScenes
getScene
```

The public capability names remain platform-neutral even when native concepts differ. The adapter maps LegendKeeper pages, maps, and pins into the closest approved LoreBridge schemas or waits for a new capability rather than overloading an incompatible one.

## 25. Extension rules

- New optional fields may be added within protocol `0.x` when old implementations can safely ignore them.
- New capability versions may coexist with older versions.
- Existing field meanings must not change within a capability version.
- Platform extensions must be namespaced and versioned.
- A new major protocol version is required for incompatible envelope or lifecycle changes.

## 26. Implementation gate

Before LoreBridge adds production service routing or additional Foundry handlers:

1. shared TypeScript types and validation schemas must implement this protocol
2. fixtures must cover successful and failed handshakes
3. fixtures must cover capability negotiation
4. request, response, error, pagination, and cancellation envelopes must validate
5. both Core and adapter packages must consume the same shared contracts

This document defines the design contract. The shared package will become the executable source of truth once implemented and tested.
