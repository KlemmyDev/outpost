# Outpost

**O**ff-grid **U**nified **T**ools for **P**reparedness, **O**rientation,
**S**urvival & **T**elecomms. *Off the grid, not out of touch.*

Outpost is a self-hosted home server HQ that keeps working when the internet
doesn't: offline Wikipedia and first aid, offline maps, MeshCore radio
messaging, and power from WattsMyPower, all in one calm app for everyone at
home. It runs on a Proxmox LXC (or any Linux box with Docker) and updates itself
from the dashboard.

> **Status: early alpha.** The platform (feature modules, settings, updates,
> install and rollback) is in place. The feature screens are placeholders.

## Install

### On Proxmox (recommended)

From the Proxmox host's shell, as root:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/KlemmyDev/outpost/main/scripts/proxmox-lxc.sh)
```

A menu offers **Default** (the recommended settings) or **Advanced** (ID,
hostname, CPU, memory, disk, storage, bridge, DHCP or static IP, VLAN, channel,
root password, SSH keys). It then creates an unprivileged Debian LXC with
nesting on (so Docker can run), installs Outpost in `/opt/outpost`, adds the
address and update commands to the container's Summary notes, and prints the
address.

| Recommended | |
| --- | --- |
| CPU | 4 cores, so updates build quickly |
| Memory | 4 GB, plus 512 MB swap |
| Disk | 250 GB: Wikipedia with pictures (~110 GB), Australian maps (~20 GB), backups and room to update |

Without the menu, pass settings as flags:

```bash
bash proxmox-lxc.sh --yes                                    # recommended settings
bash proxmox-lxc.sh --ctid 120 --storage big-zfs --disk 300 \
  --ip 192.168.1.50/24 --gateway 192.168.1.1 --channel stable --yes
```

Update or roll back later without logging into the container:

```bash
bash proxmox-lxc.sh --update 120
bash proxmox-lxc.sh --rollback 120
bash proxmox-lxc.sh --status 120
```

### In an existing container or Linux machine

```bash
curl -fsSL https://raw.githubusercontent.com/KlemmyDev/outpost/main/install.sh | bash
```

On an existing Proxmox LXC, turn on **Options › Features › nesting** first.
The installer sets up git, Docker and a cron job for dashboard updates if
they're missing, asks for the time zone and port, and starts Outpost on port
3000.

## Updating

Open **Settings › Updates** and press **Install**. Or, on the host:

```bash
bash install.sh                  # update to the newest release on your channel
bash install.sh --channel stable # switch channel
bash install.sh --rollback       # go back to the version before
```

Every update backs up the database first and keeps the previous image for
rollback. Channels are **stable**, **beta** (the default) and **nightly**. See
[docs/updates.md](docs/updates.md) for how it works.

## Features

Every part of Outpost is a module you can switch off in **Settings ›
Features**, or lock in `.env`:

```bash
OUTPOST_FEATURES=messages,-power   # force Messages on and Power off
```

| Feature | Code | Default |
| --- | --- | --- |
| Library | ARCHIVE | on |
| First aid (needs Library) | AID STATION | on |
| Map | RECON | on |
| Messages (needs a LoRa radio) | COMMS | off |
| Power (needs WattsMyPower) | PWR | off |
| Emergency | WATCHTOWER | on |

Adding a feature takes a manifest, a page and a route: see
[docs/features.md](docs/features.md).

## Development

Needs Node 24.

```bash
npm install
npm run dev        # http://localhost:3000, data in ./data
npm run check      # typecheck and tests
npm run build && npm start
```

Built with [TanStack Start](https://tanstack.com/start) (React, file routes,
server routes), Node's built-in SQLite, and Docker Compose.

```
src/
  features/<id>/        each feature module: manifest.ts, Page.tsx
  platform/
    features/           manifests, resolving what's on, route guard
    updates/            channels and tags, the host/container file protocol
    server/             config, database, settings, feature and update services
    ui/                 app shell, logo, shared components
  routes/               pages, and api/ for the JSON API
install.sh              install, update, rollback, uninstall (runs on the host)
updater.sh              cron job: turns dashboard requests into install.sh runs
scripts/                proxmox-lxc.sh, release.sh, version.sh
```

## API

| Method | Path | |
| --- | --- | --- |
| GET | `/api/healthz` | health, version, commit |
| GET | `/api/features` | every feature and whether it's on |
| PUT | `/api/features/:id` | `{"enabled": true}` |
| GET | `/api/updates` | version, latest release, updater state |
| POST | `/api/updates/check` | check GitHub now |
| PUT | `/api/updates/channel` | `{"channel": "stable"}` |
| POST | `/api/updates/install` | ask the host to update |

Requests that change something need the header `X-Outpost: 1`.
