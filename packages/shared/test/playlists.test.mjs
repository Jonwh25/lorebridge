import assert from "node:assert/strict";
import test from "node:test";
import {
  validateListPlaylistsInput,
  validateListPlaylistsOutput,
  validateSearchPlaylistsInput,
  validateSearchPlaylistsOutput,
} from "../dist/capabilities/playlists.js";

test("playlist inputs validate visibility, limits, and folder filters", () => {
  assert.equal(validateListPlaylistsInput({ mode: "player" }).valid, true);
  assert.equal(validateListPlaylistsInput({ mode: "secret" }).valid, false);
  assert.equal(validateSearchPlaylistsInput({ query: "battle", limit: 50, folderId: "f1" }).valid, true);
  assert.equal(validateSearchPlaylistsInput({ query: "", limit: 51 }).valid, false);
});

test("playlist outputs require playback state and non-negative track counts", () => {
  const list = { sourceId: "foundry:cos", sourceName: "Curse of Strahd", playlists: [{ playlistId: "p1", playlistName: "Battle", playing: true, trackCount: 2 }], hiddenCount: 0 };
  assert.equal(validateListPlaylistsOutput(list).valid, true);
  assert.equal(validateListPlaylistsOutput({ ...list, playlists: [{ ...list.playlists[0], trackCount: -1 }] }).valid, false);
  assert.equal(validateSearchPlaylistsOutput({ sourceId: "foundry:cos", sourceName: "Curse of Strahd", query: "battle", results: list.playlists, hiddenCount: 0 }).valid, true);
});
