import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { listPlaylists, searchPlaylists } from "../src/capabilities/playlists.js";

const originalGame = Object.getOwnPropertyDescriptor(globalThis, "game");
afterEach(() => originalGame ? Object.defineProperty(globalThis, "game", originalGame) : Reflect.deleteProperty(globalThis, "game"));

function setGame(): void {
  const playlists = Object.assign([
    { id: "p1", uuid: "Playlist.p1", name: "Castle Ambience", playing: true, sounds: Object.assign([{}], { size: 1 }), folder: { id: "f1", name: "Ambience" }, ownership: { default: 0 } },
    { id: "p2", uuid: "Playlist.p2", name: "Battle Music", playing: false, sounds: Object.assign([{}, {}], { size: 2 }), folder: { id: "f2", name: "Combat" }, ownership: { default: 2 } },
  ], { size: 2 });
  Object.defineProperty(globalThis, "game", { configurable: true, value: { user: { isGM: true, name: "GM" }, world: { id: "cos", title: "Curse of Strahd" }, playlists } });
}

test("lists playlists with playback state and track count", () => {
  setGame();
  const output = listPlaylists({});
  assert.deepEqual(output.playlists.map((p) => p.playlistName), ["Battle Music", "Castle Ambience"]);
  assert.equal(output.playlists[1]?.playing, true);
  assert.equal(output.playlists[1]?.trackCount, 1);
});

test("searches names with folder context and folder filtering", () => {
  setGame();
  const output = searchPlaylists({ query: "music", folderId: "f2" });
  assert.equal(output.results.length, 1);
  assert.equal(output.results[0]?.playlistId, "p2");
  assert.equal(output.results[0]?.folderName, "Combat");
});

test("player mode filters hidden playlists for list and search", () => {
  setGame();
  const listed = listPlaylists({ mode: "player" });
  assert.deepEqual(listed.playlists.map((p) => p.playlistId), ["p2"]);
  assert.equal(listed.hiddenCount, 1);
  const searched = searchPlaylists({ query: "castle", mode: "player" });
  assert.equal(searched.results.length, 0);
  assert.equal(searched.hiddenCount, 1);
});
