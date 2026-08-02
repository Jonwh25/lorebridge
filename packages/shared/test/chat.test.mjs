import assert from "node:assert/strict";
import test from "node:test";
import { validateGetChatMessagesInput, validateGetChatMessagesOutput } from "../dist/capabilities.js";
test("validates chat message contracts", () => { assert.equal(validateGetChatMessagesInput({ limit: 20, mode: "player" }).valid, true); assert.equal(validateGetChatMessagesInput({ limit: 101 }).valid, false); assert.equal(validateGetChatMessagesOutput({ sourceId: "foundry:x", sourceName: "World", messages: [], hiddenCount: 0 }).valid, true); });
