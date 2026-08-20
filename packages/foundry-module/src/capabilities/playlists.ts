import {
  validateListPlaylistsInput,
  validateListPlaylistsOutput,
  validateSearchPlaylistsInput,
  validateSearchPlaylistsOutput,
  type ListPlaylistsInput,
  type ListPlaylistsOutput,
  type PlaylistSummary,
  type SearchPlaylistsInput,
  type SearchPlaylistsOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { isPlayerVisible } from "./visibility.js";

const DEFAULT_LIMIT = 10;

function sourceId(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return `foundry:${game.world.id}`;
}

function sourceName(): string {
  if (!game.world) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry world is not fully initialized.", { retryable: true });
  return game.world.title;
}

function summarize(playlist: FoundryPlaylist): PlaylistSummary {
  const summary: PlaylistSummary = {
    playlistId: playlist.id,
    playlistName: playlist.name,
    playing: playlist.playing,
    trackCount: playlist.sounds.size,
  };
  if (playlist.folder?.id) summary.folderId = playlist.folder.id;
  if (playlist.folder?.name) summary.folderName = playlist.folder.name;
  return summary;
}

export function listPlaylists(input: ListPlaylistsInput): ListPlaylistsOutput {
  requireFoundryGm("listPlaylists");
  const validated = validateListPlaylistsInput(input);
  if (!validated.valid || !validated.value) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Playlist list input is invalid.", { details: { validationErrors: validated.errors } });
  if (!game.playlists) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry playlist collection is unavailable.", { retryable: true });

  const playerMode = validated.value.mode === "player";
  const playlists: PlaylistSummary[] = [];
  let hiddenCount = 0;
  for (const playlist of game.playlists) {
    if (playerMode && !isPlayerVisible(playlist.ownership)) { hiddenCount++; continue; }
    playlists.push(summarize(playlist));
  }
  playlists.sort((a, b) => a.playlistName.localeCompare(b.playlistName) || a.playlistId.localeCompare(b.playlistId));
  const output = { sourceId: sourceId(), sourceName: sourceName(), playlists, hiddenCount };
  const outputValidation = validateListPlaylistsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned invalid playlist results.", { details: { validationErrors: outputValidation.errors } });
  return outputValidation.value;
}

export function searchPlaylists(input: SearchPlaylistsInput): SearchPlaylistsOutput {
  requireFoundryGm("searchPlaylists");
  const validated = validateSearchPlaylistsInput(input);
  if (!validated.valid || !validated.value) throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Playlist search input is invalid.", { details: { validationErrors: validated.errors } });
  if (!game.playlists) throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "The Foundry playlist collection is unavailable.", { retryable: true });

  const query = validated.value.query.trim();
  const needle = query.toLocaleLowerCase();
  const playerMode = validated.value.mode === "player";
  const results: PlaylistSummary[] = [];
  let hiddenCount = 0;
  for (const playlist of game.playlists) {
    if (playerMode && !isPlayerVisible(playlist.ownership)) { hiddenCount++; continue; }
    if (validated.value.folderId !== undefined && playlist.folder?.id !== validated.value.folderId) continue;
    if (!playlist.name.toLocaleLowerCase().includes(needle)) continue;
    results.push(summarize(playlist));
  }
  results.sort((a, b) => {
    const exactA = a.playlistName.toLocaleLowerCase() === needle ? 0 : 1;
    const exactB = b.playlistName.toLocaleLowerCase() === needle ? 0 : 1;
    return exactA - exactB || a.playlistName.localeCompare(b.playlistName) || a.playlistId.localeCompare(b.playlistId);
  });
  const output = { sourceId: sourceId(), sourceName: sourceName(), query, results: results.slice(0, validated.value.limit ?? DEFAULT_LIMIT), hiddenCount };
  const outputValidation = validateSearchPlaylistsOutput(output);
  if (!outputValidation.valid || !outputValidation.value) throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "Foundry returned invalid playlist search results.", { details: { validationErrors: outputValidation.errors } });
  return outputValidation.value;
}
