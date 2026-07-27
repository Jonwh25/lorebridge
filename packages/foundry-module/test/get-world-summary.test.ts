import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  getWorldSummary,
  LoreBridgeCapabilityError
} from "../src/capabilities/get-world-summary.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");

afterEach(() => {
  if (originalGame) {
    Object.defineProperty(globalThis, "game", originalGame);
  } else {
    Reflect.deleteProperty(globalThis, "game");
  }
});

function setGame(value: unknown): void {
  Object.defineProperty(globalThis, "game", {
    value,
    configurable: true,
    writable: true
  });
}

function createFoundryGame(isGM = true): Record<string, unknown> {
  return {
    user: { isGM, name: isGM ? "GM" : "Player" },
    version: "14.365",
    world: { id: "cos", title: "Curse of Strahd" },
    system: { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition", version: "5.3.3" },
    actors: { size: 686 },
    scenes: { size: 624 },
    journal: { size: 842 },
    modules: new Map([
      ["lorebridge", { active: true }],
      ["inactive-module", { active: false }]
    ])
  };
}

test("returns a normalized schema-valid summary for a GM", () => {
  setGame(createFoundryGame());

  const result = getWorldSummary();

  assert.deepEqual(result, {
    source: { sourceId: "foundry:cos", adapterType: "foundry" },
    world: { id: "cos", title: "Curse of Strahd", foundryVersion: "14.365" },
    system: { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition", version: "5.3.3" },
    counts: {
      actors: 686,
      scenes: 624,
      journals: 842,
      installedModules: 2,
      activeModules: 1
    }
  });

  assert.doesNotThrow(() => JSON.stringify(result));
});

test("rejects a non-GM without exposing campaign data", () => {
  setGame(createFoundryGame(false));

  assert.throws(
    () => getWorldSummary(),
    (error: unknown) => {
      assert.ok(error instanceof LoreBridgeCapabilityError);
      assert.equal(error.code, "NOT_AUTHORIZED");
      assert.equal(error.retryable, false);
      assert.doesNotMatch(error.message, /Curse of Strahd|686|842/);
      return true;
    }
  );
});

test("returns a structured adapter error before Foundry is ready", () => {
  setGame({ user: { isGM: true } });

  assert.throws(
    () => getWorldSummary(),
    (error: unknown) => {
      assert.ok(error instanceof LoreBridgeCapabilityError);
      assert.equal(error.code, "ADAPTER_UNAVAILABLE");
      assert.equal(error.retryable, true);
      return true;
    }
  );
});

test("returns a structured adapter error when the Foundry runtime is absent", () => {
  Reflect.deleteProperty(globalThis, "game");

  assert.throws(
    () => getWorldSummary(),
    (error: unknown) => {
      assert.ok(error instanceof LoreBridgeCapabilityError);
      assert.equal(error.code, "ADAPTER_UNAVAILABLE");
      return true;
    }
  );
});