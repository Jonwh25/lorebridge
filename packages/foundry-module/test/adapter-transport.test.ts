import assert from "node:assert/strict";
import test from "node:test";

import type { AdapterRegistration } from "@lorebridge/shared";
import {
  createAdapterWebSocketUrl,
  LoreBridgeAdapterTransport,
} from "../src/adapter-transport.js";

class FakeWebSocket extends EventTarget {
  readonly sent: string[] = [];

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
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
