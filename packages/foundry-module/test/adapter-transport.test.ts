import assert from "node:assert/strict";
import test from "node:test";

import type { AdapterRegistration } from "@lorebridge/shared";
import {
  createAdapterWebSocketUrl,
  LoreBridgeAdapterTransport,
} from "../src/adapter-transport.js";

class FakeWebSocket extends EventTarget {
  readonly sent: string[] = [];
  closed = false;

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }

  open(): void {
    this.dispatchEvent(new Event("open"));
  }

  receive(value: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
  }
}

const registration: AdapterRegistration = {
  adapterId: "foundry-vtt",
  adapterType: "foundry",
  adapterVersion: "0.1.6",
  protocolVersions: ["0.1"],
  sources: [{
    sourceId: "foundry:cos",
    adapterId: "foundry-vtt",
    sourceType: "foundry-world",
    name: "Curse of Strahd",
  }],
  capabilities: [{
    name: "getWorldSummary",
    mode: "read",
    version: "0.1",
  }],
};

test("derives a WebSocket endpoint without discarding a reverse-proxy path", () => {
  assert.equal(
    createAdapterWebSocketUrl("https://foundry.example/lorebridge-api/"),
    "wss://foundry.example/lorebridge-api/v1/adapter",
  );
});

test("authenticates and records a welcomed adapter session", async () => {
  const socket = new FakeWebSocket();
  const transport = new LoreBridgeAdapterTransport(
    "https://foundry.example/lorebridge-api/",
    "signed-token",
    registration,
    undefined,
    () => socket as unknown as WebSocket,
  );

  const connection = transport.connect();
  socket.open();
  const hello = JSON.parse(socket.sent[0] ?? "{}") as Record<string, unknown>;
  assert.equal(hello.kind, "adapter.hello");
  assert.equal(hello.token, "signed-token");

  socket.receive({
    kind: "adapter.welcome",
    protocolVersion: "0.1",
    sessionId: "session_test",
    backendId: "lb_test",
    acceptedAt: "2026-07-29T00:00:00.000Z",
  });

  assert.deepEqual(await connection, {
    state: "connected",
    sessionId: "session_test",
    backendId: "lb_test",
  });
});

test("executes an allowlisted backend request and returns a correlated response", async () => {
  const socket = new FakeWebSocket();
  const transport = new LoreBridgeAdapterTransport(
    "https://foundry.example/lorebridge-api/",
    "signed-token",
    registration,
    (request) => {
      assert.equal(request.sourceId, "foundry:cos");
      assert.equal(request.capability, "getWorldSummary");
      return {
        source: { sourceId: "foundry:cos", adapterType: "foundry" },
        world: { id: "cos", title: "Curse of Strahd", foundryVersion: "14.365" },
        system: { id: "dnd5e", title: "D&D 5e", version: "5.3.3" },
        counts: {
          actors: 686,
          scenes: 624,
          journals: 842,
          installedModules: 20,
          activeModules: 20,
        },
      };
    },
    () => socket as unknown as WebSocket,
  );

  const connection = transport.connect();
  socket.open();
  socket.receive({
    kind: "adapter.welcome",
    protocolVersion: "0.1",
    sessionId: "session_test",
    backendId: "lb_test",
    acceptedAt: "2026-07-29T00:00:00.000Z",
  });
  await connection;

  socket.receive({
    kind: "request",
    messageId: "message_request",
    correlationId: "correlation_test",
    protocolVersion: "0.1",
    timestamp: "2026-07-29T00:00:01.000Z",
    sourceId: "foundry:cos",
    capability: "getWorldSummary",
    input: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const response = JSON.parse(socket.sent.at(-1) ?? "{}") as {
    kind: string;
    correlationId: string;
    output: { world: { title: string } };
  };
  assert.equal(response.kind, "response");
  assert.equal(response.correlationId, "correlation_test");
  assert.equal(response.output.world.title, "Curse of Strahd");
});

test("retries a timed-out startup connection and accepts a later handshake", async () => {
  const sockets: FakeWebSocket[] = [];
  let notifySecondSocket: (() => void) | undefined;
  const secondSocketCreated = new Promise<void>((resolve) => {
    notifySecondSocket = resolve;
  });
  const transport = new LoreBridgeAdapterTransport(
    "https://foundry.example/lorebridge-api/",
    "signed-token",
    registration,
    undefined,
    () => {
      const socket = new FakeWebSocket();
      sockets.push(socket);
      if (sockets.length === 2) notifySecondSocket?.();
      return socket as unknown as WebSocket;
    },
  );

  const connection = transport.connect({
    timeoutMs: 50,
    maxAttempts: 2,
    retryDelayMs: 1,
  });
  await secondSocketCreated;

  const retrySocket = sockets[1];
  assert.ok(retrySocket);
  retrySocket.open();
  retrySocket.receive({
    kind: "adapter.welcome",
    protocolVersion: "0.1",
    sessionId: "session_retry",
    backendId: "lb_retry",
    acceptedAt: "2026-07-29T00:00:00.000Z",
  });

  assert.deepEqual(await connection, {
    state: "connected",
    sessionId: "session_retry",
    backendId: "lb_retry",
  });
});

test("reports a bounded error after all startup attempts time out", async () => {
  const sockets: FakeWebSocket[] = [];
  const transport = new LoreBridgeAdapterTransport(
    "https://foundry.example/lorebridge-api/",
    "signed-token",
    registration,
    undefined,
    () => {
      const socket = new FakeWebSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  );

  const state = await transport.connect({
    timeoutMs: 2,
    maxAttempts: 2,
    retryDelayMs: 1,
    autoReconnect: false,
  });

  assert.equal(sockets.length, 2);
  assert.ok(sockets.every((socket) => socket.closed));
  assert.deepEqual(state, {
    state: "error",
    message: "LoreBridge backend connection timed out. (2 attempts.)",
  });
});

test("reconnects automatically after an established backend session closes", async () => {
  const sockets: FakeWebSocket[] = [];
  let notifySecondSocket: (() => void) | undefined;
  const secondSocketCreated = new Promise<void>((resolve) => {
    notifySecondSocket = resolve;
  });
  const transport = new LoreBridgeAdapterTransport(
    "https://foundry.example/lorebridge-api/",
    "signed-token",
    registration,
    undefined,
    () => {
      const socket = new FakeWebSocket();
      sockets.push(socket);
      if (sockets.length === 2) notifySecondSocket?.();
      return socket as unknown as WebSocket;
    },
  );

  const initialConnection = transport.connect({
    timeoutMs: 50,
    maxAttempts: 1,
    retryDelayMs: 1,
    maxReconnectDelayMs: 5,
  });
  const initialSocket = sockets[0];
  assert.ok(initialSocket);
  initialSocket.open();
  initialSocket.receive({
    kind: "adapter.welcome",
    protocolVersion: "0.1",
    sessionId: "session_initial",
    backendId: "lb_test",
    acceptedAt: "2026-07-29T00:00:00.000Z",
  });
  assert.equal((await initialConnection).state, "connected");

  initialSocket.close();
  assert.deepEqual(transport.state, { state: "disconnected" });
  await secondSocketCreated;

  const reconnectSocket = sockets[1];
  assert.ok(reconnectSocket);
  reconnectSocket.open();
  reconnectSocket.receive({
    kind: "adapter.welcome",
    protocolVersion: "0.1",
    sessionId: "session_reconnected",
    backendId: "lb_test",
    acceptedAt: "2026-07-29T00:00:01.000Z",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(transport.state, {
    state: "connected",
    sessionId: "session_reconnected",
    backendId: "lb_test",
  });
  transport.disconnect();
});

test("does not reconnect after an intentional disconnect", async () => {
  const sockets: FakeWebSocket[] = [];
  const transport = new LoreBridgeAdapterTransport(
    "https://foundry.example/lorebridge-api/",
    "signed-token",
    registration,
    undefined,
    () => {
      const socket = new FakeWebSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  );

  const connection = transport.connect({
    timeoutMs: 50,
    maxAttempts: 1,
    retryDelayMs: 1,
    maxReconnectDelayMs: 5,
  });
  const socket = sockets[0];
  assert.ok(socket);
  socket.open();
  socket.receive({
    kind: "adapter.welcome",
    protocolVersion: "0.1",
    sessionId: "session_test",
    backendId: "lb_test",
    acceptedAt: "2026-07-29T00:00:00.000Z",
  });
  await connection;

  transport.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(sockets.length, 1);
  assert.deepEqual(transport.state, { state: "disconnected" });
});
