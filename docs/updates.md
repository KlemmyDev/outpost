# Updates and releases

Outpost updates the same way as WattsMyPower: the host does the work, the app
only asks. The container never gets the Docker socket or write access to the
code, so a bug or a compromised feature can't rebuild the server.

## Channels

| Channel | Follows | For |
| --- | --- | --- |
| stable | the newest `vYYYY.M.D` tag | most homes |
| beta | the newest `vYYYY.M.D` or `vYYYY.M.D-beta[.N]` tag | trying things a little earlier (the default) |
| nightly | the head of `main` | development |

Versions are CalVer from `package.json`, set to the day's date (Brisbane) on
every push to main by `.github/workflows/version.yml`. The tag rule exists in
three places that must agree: `src/platform/updates/channels.ts`,
`channel_tag()` in `install.sh`, and `scripts/release.sh`.

## How an update happens

```
 Settings › Updates ──POST /api/updates/install──▶ app writes data/update/request
                                                        │
 cron, every minute: updater.sh ◀───────────────────────┘
   writes updater.json (heartbeat), sees the request, takes a lock,
   writes status.json {state: running}, runs `install.sh --yes`
                                                        │
 install.sh --yes                                       ▼
   1. git fetch, then checkout the channel's tag (or main for nightly)
   2. back up data/outpost.db (stops here if the backup fails)
   3. tag the running image outpost:previous, note it in data/update/previous
   4. docker compose build --build-arg GIT_COMMIT=<sha>, then up -d
   5. wait up to 90 s for /api/healthz
                                                        │
 updater.sh writes status.json {state: done | failed} ◀─┘
 The UI polls /api/updates every 3 s, sees the new commit, and reloads.
```

The files in `data/update/` (mounted at `/data/update/` in the container):

| File | Written by | Purpose |
| --- | --- | --- |
| `channel` | both | the release channel |
| `request` | app | "please update"; only its time matters |
| `updater.json` | updater.sh | heartbeat `{seen_at, can_update, why}` |
| `status.json` | updater.sh | `{state, requested_at, started_at, finished_at, from, to, error}` |
| `update.log` | updater.sh | output of `install.sh --yes` |
| `previous` | install.sh | what `--rollback` returns to |

Each is written whole (temp file, then rename). The app treats the updater as
gone after 3 minutes without a heartbeat, ignores requests older than 15
minutes, and shows a finished update for 15 minutes.

## Rolling back

Never automatic. A failed health check stops with a message, and the previous
image is kept:

```bash
bash install.sh --rollback                 # in the container's folder
bash scripts/proxmox-lxc.sh --rollback 120 # from the Proxmox host
```

Rollback restores the database from the backup taken just before the update.
A backup of the newer database is taken first, so nothing is lost.

## Cutting a release

```bash
scripts/release.sh beta            # tag origin/main as v2026.11.27-beta
scripts/release.sh stable          # tag it as v2026.11.27
```

It checks the commit is on main and that CI passed, shows the changes since
the last tag on that channel, then tags, pushes and creates a GitHub release.
