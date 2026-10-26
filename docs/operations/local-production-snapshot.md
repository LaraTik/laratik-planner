# Local production snapshot

This workflow copies the production PostgreSQL database through the existing
`laratik-vps` SSH alias, scrubs identity and integration credentials in a local
staging database, stores a reusable local dump, and restores it into the
dedicated `planner_snapshot` database. It does not write to production.

## First capture

Run:

```bash
./scripts/local-prod-snapshot.sh capture
```

The script streams `pg_dump` over SSH directly into a temporary Postgres
container backed by a RAM-only filesystem and with networking disabled. It
does not save a raw production dump on the laptop or the persistent local
database. The reusable scrubbed dump and marker are stored under the git-ignored
`tmp/local-prod-snapshot/` directory with owner-only permissions. The snapshot
uses its own Postgres container and data volume, separate from `planner` and
`planner_test`, and listens only on `127.0.0.1:5434` by default.

That container is **long-lived by design** — the script creates it with
`--restart unless-stopped` and never removes it, so it survives reboots and
keeps running long after the preview is over. A forgotten snapshot container is
one of the most common reasons `docker ps` shows more planner containers than
expected. Stop it when the preview is done:

```bash
docker rm -f laratik-planner-pg-snapshot
```

The next `capture` / `restore` / `run` recreates it on demand.

## Restore and run again

Restore the saved copy without contacting production:

```bash
./scripts/local-prod-snapshot.sh restore
```

Restore the saved copy and start the local app:

```bash
./scripts/local-prod-snapshot.sh run
```

`run` uses `planner_snapshot`, rotates local-only auth/signing secrets, points
email at localhost, disables Sentry, AI provider keys, social sync, advertising
sync/reporting, publishing, community auto-send, and cron auth. Sign in at
`http://localhost:3000/dev/signin` as `local-preview@example.invalid`.

If port 5434 is already occupied, set `LOCAL_SNAPSHOT_PG_PORT` to a free port;
the snapshot URL follows that setting automatically. For a custom URL, also set
`LOCAL_SNAPSHOT_DATABASE_URL` to a loopback URL on the same port and ending in
`/planner_snapshot` without query parameters or a fragment. The script rejects
non-loopback hosts, mismatched ports, and any database name other than the
fixed snapshot database.
`LARATIK_VPS_SSH_TARGET` can override the default `laratik-vps` SSH alias.
If another app is using port 3000, set `LOCAL_PLANNER_PORT` to a free local
port; the local auth URL follows it.
When the snapshot script lives in a separate worktree, set
`LOCAL_PLANNER_APP_DIR` to the checkout whose UI you want to preview; that
checkout's migrations are applied to the local snapshot before the server starts.

## Data handling

The saved copy keeps workspace and production content records to make the UI
representative. User names and email addresses are replaced; authentication
sessions, OAuth tokens, provider credentials, MCP tokens, AI secrets, object
storage credentials, community message bodies, comments, notification text,
email outbox rows, and activity before/after payloads are removed or
neutralized. File objects are not copied. This is not a full anonymization of
business content: append-only platform/support audit histories are omitted,
while workspace and content details remain. Treat the local snapshot as
confidential production data, keep the machine encrypted, and do not share or
commit the dump.

`restore` replaces only `planner_snapshot` in the dedicated snapshot container;
the normal local `planner` and `planner_test` databases and production are not
restore targets. `capture` is the only command that reads production, and its
remote operation is a database dump over the existing SSH access.
