# Campaign Codex incremental export

Campaign Codex export compares file content with the last successful backend
write. Unchanged chunks make no GitHub API calls and create no commit. Changed
files are committed normally; stale-file cleanup still runs. The existing
GitHub path lookups used to discover stale files are unchanged.

The result dialog shows **X committed, Y unchanged**, including totals for each
selected folder. Deleted files are reported separately. A commit link appears
only when that export actually created a commit. Empty selected folders can
still remove stale exported files under their configured paths.

## Storage and recovery

The backend stores `cc-export-hashes.json` in `LOREBRIDGE_DATA_DIR` (the default
is `.lorebridge` under the backend working directory). No new configuration or
dependencies are required. The file contains SHA-256 hashes of content and of
repository/branch/resolved-path keys, without tokens, journal text, or filenames.

The cache survives backend restarts. A missing, malformed, or unsupported cache
causes a full export. To force a full rewrite after editing or restoring the
backup repository outside LoreBridge, stop the backend, remove only
`cc-export-hashes.json` from its configured data directory, and restart it.
The next export rebuilds the cache. Foundry remains the export's source of truth;
the cache does not detect external GitHub edits or branch resets.

Use one backend process per data directory and backup destination. Writes through
that process share a queue, including other LoreBridge backup routes. Entries for
affected paths are invalidated on disk before a write and recorded only after a
successful GitHub ref update. Deletion removes its cached hash. Repository,
branch, and resolved path changes cannot reuse an unrelated entry.

If the cache cannot be read or invalidated safely, the request fails before
writing to GitHub. Check backend data-directory access and retry. If GitHub
succeeds but saving new hashes fails, the export remains successful, a generic
backend warning is logged, and the next export may rewrite those files.

## API response

Authenticated `POST /v1/backup/github/lore-files` responses include `committed`
(number of written files), `skipped` (number of unchanged files), and `files`
(the paths actually written). `commitSha` and `commitUrl` are present only when
a commit was created. A deletion-only request can create a commit with
`committed: 0`. Empty requests with `files: []` return zero counts without a
commit. Existing authentication and path validation still apply on cache hits.

The Foundry module also accepts older backend responses without counts during
an upgrade, treating their submitted files as committed.

## Live acceptance

1. Export a selected Campaign Codex section with no existing cache: all files
   should be committed. Repeat unchanged: zero committed, all unchanged, no new
   commit or link in the result dialog.
2. Edit one journal's exported text and repeat: only that file is committed.
3. Delete or rename a journal and repeat: stale paths are removed. Recreate the
   deleted journal with its original content: its file must be committed again.
   Also test deleting the last journal from a selected folder.
4. Restart the backend and repeat unchanged: the export still skips files.
5. Verify the result dialog's counts and link at its initial size, a smaller
   practical size, and after enlargement; content must scroll and Close remain
   reachable.
