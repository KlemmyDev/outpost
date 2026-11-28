# Outpost

**O**ff-grid **U**nified **T**ools for **P**reparedness, **O**rientation,
**S**urvival & **T**elecomms. *Off the grid, not out of touch.*

Outpost is a self-hosted home server HQ that keeps working when the internet
doesn't: offline Wikipedia and first aid, offline maps, MeshCore radio
messaging, and power from WattsMyPower, all in one calm app for everyone at
home. It runs on a Proxmox LXC (or any Linux box with Docker) and updates itself
from the dashboard.

> **Status: early alpha.** The platform (feature modules, settings, updates,
> install and rollback), internet monitoring and the Library are working. First
> aid, the map, messages and power are still placeholders.

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
| Internet (contacts outside hosts) | NET | on |
| Library | ARCHIVE | on |
| First aid (needs Library) | AID STATION | on |
| Map | RECON | on |
| Messages (needs a LoRa radio) | COMMS | off |
| Power (needs WattsMyPower) | PWR | off |
| Emergency | WATCHTOWER | on |

Adding a feature takes a manifest, a page and a route: see
[docs/features.md](docs/features.md).

## Library

The Library keeps whole collections on the server so they open with no
internet: Wikipedia, WikiMed, Wikivoyage, Wikibooks (with its Cookbook),
iFixit, Wiktionary, and anything else in
[Kiwix's catalogue](https://library.kiwix.org). Pick them in **Library ›
Sources**. Most come in three sizes: with pictures, text only, or
introductions only.

- **The hub** (the Library's front page) reads across every book at once:
  *Today in the library* picks five pages with their pictures and first lines
  each day, and eight topics (health, food, water, shelter, power and repairs,
  growing, emergencies, reference) gather the best page for each of their
  questions from whatever's installed. Topics with nothing yet suggest what to
  download.
- Downloads run two at a time (1 to 4, set on the Sources screen), resume after a dropped connection or a restart,
  and are checked against Kiwix's SHA-256 before they're added.
- Books live in `data/library` as `.zim` files. You can also copy `.zim` files
  there yourself; they appear within a few seconds.
- A small [kiwix-serve](https://github.com/kiwix/kiwix-tools) container
  (`outpost-kiwix`) reads the files. Only Outpost talks to it, so it has no port
  of its own.
- **Australian guides** (Sources › Australian guides, about 36 MB): ANZCOR first
  aid guidelines and flowcharts (CPR, bleeding, burns, snake and spider bites,
  marine stings and more), Red Cross RediPlan, NSW RFS and CFA bushfire plans,
  Get Ready Queensland cards, and the Australian Dietary Guidelines. Their
  publishers allow copies for your own use but not redistribution, so Outpost
  doesn't ship them: your server downloads each from its publisher. PDFs are
  kept as published; web pages keep their text in the reader's layout, with
  their pictures and a link to the original. Saved guides are rechecked monthly.
- **Cooking** picks from Kiwix: recipe collections, the Seasoned Advice cooking
  Q&A and the USDA's home canning guide, all small, with one button to get them
  all.
- **Be prepared** picks from Kiwix: the offline map of Australia (opens in its
  own viewer), water treatment, food preparation, a post-disaster library and
  MedlinePlus.
- The reader cleans each page into Outpost's type, with contents, paper, sepia
  and night themes, five text sizes, saved pages and history. **Original
  layout** opens the page as the book made it, sandboxed.

## Emergency

**Emergency** follows official warnings for your state: the Bureau of
Meteorology's weather and flood warnings everywhere, and fire and emergency
warnings near home from the Queensland Fire Department, NSW Rural Fire Service
and VicEmergency (measured from Home on the Map). It checks every 10 minutes
while there's internet, keeps the last warnings for when there isn't, and
notifies for new Watch and Act and Emergency Warnings near home and severe
weather.

- **How the house is holding up:** one board for the internet, power and the
  battery, the radio, the first aid guides, Home on the map and the kit.
- **Plan:** who to call (with medical details), where to meet, how to turn off
  power, gas and water, pets and insurance. Shared by everyone at home, and
  printable for the fridge.
- **Kit:** Red Cross and Get Ready Queensland's emergency kit as a checklist,
  with expiry dates and reminders.

WA, SA, Tasmania and the NT get BOM's warnings only for now.

## First aid

**First aid** puts 000, Poisons Information (13 11 26) and healthdirect at the
top of every page, tappable on phones, then short steps for 22 emergencies:
CPR, choking, asthma (4×4×4), anaphylaxis, heart attack, stroke (FAST),
bleeding, burns, head injuries and fractures, snake, spider and marine stings,
seizures, low blood sugar, poisoning, shock, heat, cold and drowning. Each
says when to call 000 and what not to do, and links to the full ANZCOR
guideline (one button saves them all from ANZCOR's site) and to WikiMed.

**Not breathing? Start CPR** opens a full-screen beat at 110 a minute: it
counts 30 compressions, then 2 breaths (or keeps going, for compressions
only), clicks along if you like, and keeps the screen on.

The steps are written for Outpost from the ANZCOR guidelines, the National
Asthma Council and ASCIA. They're a reminder, not training.

## Map

**Map** draws the offline map with MapLibre in Outpost's own style, light or
night. The map file is a Kiwix maps ZIM (the map of Australia is about 1.9 GB),
downloaded from the Map page or Library › Sources, so the Map needs the
Library on.

- Search places by name: Outpost reads the map's tiles once and builds its own
  place index (towns, suburbs, peaks, lakes), so search works offline. Type
  coordinates (`-33.87, 151.21`, `33.87S 151.21E`) or MGRS (`56H LH 34368 50948`)
  to jump to a spot.
- Tap to drop a pin; save it as a waypoint (home, meeting point, water, fuel,
  medical, shelter, hazard), with notes. Pins can be dragged to move them.
  Waypoints are shared by everyone at home, and export as GPX.
- Measure distances leg by leg, with compass directions. Positions show in
  decimal, degrees-minutes-seconds and MGRS.
- "Me" shows your location only when Outpost is opened over HTTPS (or on the
  server itself); browsers don't share location with plain-HTTP pages.

## Messages

**Messages** (off by default) texts over a [MeshCore](https://meshcore.co.uk)
LoRa radio: no internet or phone network, a few kilometres on its own and much
further through repeaters. Outpost keeps the radio connected and every message
in its database, so everyone at home reads and sends from the browser.

- Any MeshCore device with the **companion radio** firmware, over USB or Wi-Fi.
  In Australia, flash it with the Australia preset (915.8 MHz).
- Channels (Public and any others on the radio) and direct messages, with
  delivery receipts, hop counts and signal strength. Failed messages can be
  sent again.
- Radios heard, with their type and distance in hops; those that share a
  position appear on the Map. You can share Home from the Map, rounded to
  about 1 km.
- A **demo radio** with pretend neighbours, to try it without hardware.

USB radio: set `MESHCORE_DEVICE=/dev/ttyACM0` (see `ls /dev/serial/by-id/`) in
`.env` and run `bash install.sh` again. On Proxmox, run this on the host to pass
the radio through to the container and set that up:

```bash
bash proxmox-lxc.sh --usb 120
```

## Power

**Power** (off by default) reads your inverter through
[WattsMyPower](https://github.com/KlemmyDev/WattsMyPower) (2026.11.2 or later),
with a read-only API key: in WattsMyPower open **Settings › Developers**, make a
key with live, history, forecast and system (and costs, if you like), then
paste it with WattsMyPower's address into Outpost's Power page.

- **Off-grid runtime:** how long the battery would keep the house going if the
  grid went down now: at this rate, through a usual night, and hour by hour
  through WattsMyPower's forecast of solar and home use.
- Solar, home, battery and grid right now; today's cost and savings; the last
  day or week; and the next two days.
- Alerts when the grid goes down and comes back, and when the battery runs low
  with no grid.

## Development

Needs Node 24.

```bash
npm install
npm run dev        # http://localhost:3000, data in ./data
npm run check      # typecheck and tests
npm run build && npm start
```

The Library needs kiwix-serve. For development, run it against `./data/library`
and point Outpost at it:

```bash
docker run -d --name outpost-kiwix -p 8080:8080 \
  -v "$PWD/data/library:/zim:ro" -v "$PWD/docker/kiwix.sh:/outpost/kiwix.sh:ro" \
  --entrypoint /bin/sh ghcr.io/kiwix/kiwix-serve:3.8.2 /outpost/kiwix.sh
KIWIX_URL=http://localhost:8080 npm run dev
```

Pictures in articles only load in a production build (`npm run build &&
npm start`); Vite's dev server answers paths ending in `.jpg` itself.

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
