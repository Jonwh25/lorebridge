import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { rollDice } from "../src/capabilities/dice.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
const originalRoll = Object.getOwnPropertyDescriptor(globalThis, "Roll");
afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, "game", originalGame); else Reflect.deleteProperty(globalThis, "game");
  if (originalRoll) Object.defineProperty(globalThis, "Roll", originalRoll); else Reflect.deleteProperty(globalThis, "Roll");
});

test("evaluates bounded Foundry dice and only posts when explicitly requested", async () => {
  Object.defineProperty(globalThis, "game", { configurable: true, value: { user: { isGM: true, name: "GM" }, world: { id: "cos", title: "Curse of Strahd" } } });
  const messages: unknown[] = [];
  class FakeRoll {
    formula: string;
    result = "3 + 5";
    total = 8;
    dice = [{ faces: 6, results: [{ result: 3, active: true }, { result: 5, active: true }] }];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() { return this; }
    async toMessage(data: unknown, options: unknown) { messages.push({ data, options }); return { id: "chat1" }; }
  }
  Object.defineProperty(globalThis, "Roll", { configurable: true, value: Object.assign(FakeRoll, { validate: (formula: string) => formula === "2d6" || formula === "4d6kh3" }) });
  const normal = await rollDice({ formula: "2d6" });
  assert.equal(normal.total, 8);
  assert.equal(normal.rolls[0]?.results[0]?.value, 3);
  assert.equal(normal.postedToChat, false);
  assert.equal(messages.length, 0);
  const posted = await rollDice({ formula: "4d6kh3", postToChat: true });
  assert.equal(posted.postedToChat, true);
  assert.equal(posted.chatMessageId, "chat1");
  assert.equal(messages.length, 1);
  await assert.rejects(() => rollDice({ formula: "not dice" }), /not valid Foundry roll syntax/);
});
