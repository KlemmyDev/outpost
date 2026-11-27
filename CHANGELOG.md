# Changelog

All notable changes to Outpost. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions are
CalVer (`YYYY.M.D`).

## [Unreleased]

### Added

- Messages over MeshCore LoRa radio: connect a companion radio by USB or Wi-Fi
  (or try the demo radio), with channels and direct messages, delivery receipts
  with round-trip time, hops and SNR, retry for failed messages, unread counts,
  notifications for direct (and optionally channel) messages, and automatic
  reconnection. Messages are kept in Outpost's database and work across the
  household.
- Radios heard: people, repeaters and room servers with route length and when
  they were last heard, and a Message button. Radios that share a position show
  on the Map, with a toggle.
- Radio settings: name, sharing Home's position (rounded to about 1 km), the
  connection, notifications, and the radio's frequency, modem settings, power
  and battery.
- USB radios in Docker (`MESHCORE_DEVICE` maps to `/dev/meshcore`, and the
  container joins the device's group), and `proxmox-lxc.sh --usb <ctid>` to pass
  a radio through to a Proxmox container.
- Map: the offline map drawn with MapLibre in Outpost's style, with paper and
  night themes, a remembered view, and a "Whole map" button. Map files are
  Kiwix maps ZIMs downloaded through the Library (one tap for the map of
  Australia when there's none yet).
- Offline place search: a place index built in the background from the map's
  own tiles (states, cities, towns, villages, suburbs, peaks, lakes), with
  progress shown while it builds. Search also finds waypoints, coordinates and
  MGRS references.
- Waypoints: drop a pin, save it with a kind (home, meeting point, water, fuel,
  medical, shelter, hazard, other) and notes, drag to move, edit, delete, see
  distance and direction from home, and export as GPX.
- Measuring: tap out a route to see the total and each leg with its direction.
- Coordinates in decimal, degrees-minutes-seconds and MGRS, tap to copy.
- The Map card on the Overview shows the map and waypoints, or download
  progress. The Map now requires the Library.
- Australian guides in the Library: 42 official documents (ANZCOR first aid
  guidelines and flowcharts, Red Cross RediPlan, NSW RFS and CFA bushfire
  plans, Get Ready Queensland cards, the Australian Dietary Guidelines and
  more), each downloaded straight from its publisher. PDFs open in the
  browser's viewer inside the Library; web pages are saved with their pictures
  and read in the reader with contents and a link to the source. They're
  searchable, can be saved and appear in history, and are rechecked monthly
  with conditional requests. If a PDF moves, Outpost finds its new address on
  the publisher's page.
- "Be prepared" recommendations: the map of Australia, water treatment, food
  preparation, a post-disaster library and MedlinePlus. Map books open in their
  own viewer inside the Library.
- Library: offline Wikipedia, WikiMed, Wikivoyage, Wikibooks, iFixit,
  Wiktionary and the rest of Kiwix's catalogue, read through a kiwix-serve
  sidecar container that Outpost keeps in step with `data/library`.
- Library home: search with title suggestions as you type, continue reading,
  your books (with a random article from each), and saved pages.
- Full-text search across every book, grouped by book, with paging inside one.
- Reader: each page cleaned into Outpost's type (scripts, styles and page
  furniture removed, pictures loaded through Outpost), contents that follow
  along as you scroll, a reading progress line, paper, sepia and night themes,
  five text sizes, serif or sans, saving for later, and links that stay in the
  reader. On phones the lead comes before the infobox. "Original layout" opens
  the page as the book made it, sandboxed.
- Sources: storage use, recommended collections with each size Kiwix offers
  (with pictures, text only, introductions only), the whole catalogue to browse
  by language and kind, downloads with progress, speed and time left, pause,
  resume and cancel, updating a book to a newer edition, and removing one.
- Downloads run one at a time into `.part` files, resume with HTTP ranges after
  a dropped connection or restart, retry with backoff, check free space first,
  are verified against Kiwix's SHA-256, and send a notification when they're
  ready or fail.
- Saved pages and reading history, with removing and clearing.
- The Library card on the Overview shows articles, books, size and download
  progress, and the Overview's search goes to the Library.
- Interactive charts: legends that show and hide each series, dots on the
  hovered point, click or Enter to pin a tooltip, lines that draw in and bars
  that grow when a chart appears or its range changes, and hovering an event
  shades its time on every chart and the uptime timeline.
- The uptime timeline can be read with the arrow keys, pinned by click, and
  its blocks lift on hover.
- Panels slide and fade in and out, with their contents rising in one after
  another. Reduced-motion settings turn the animations off.
- Internet monitoring: a probe on a configurable interval (default every
  minute) measures latency, jitter and packet loss to Cloudflare, Google DNS
  and GitHub, plus DNS time. Scheduled speed tests (default every 6 hours,
  skipped during outages) measure download and upload via Cloudflare.
- Outage detection with hysteresis: 2 failed probes in a row is an outage, 3
  poor ones is "struggling", 2 good ones ends it. A speed test below a set
  share of your 7-day usual counts as slow. Events are kept and shown.
- Internet dashboard: uptime timeline, latency and jitter, packet loss and
  speed history charts with hover details and table views, an events list,
  and Check now / Run speed test. Ranges of an hour, day, week or month.
- Monitoring settings: probe interval, speed test schedule and size (with a
  monthly data estimate), thresholds, notifications and history length.
- Notifications for the whole platform: a bell in the header, plus optional
  ntfy and webhook delivery with a minimum level and a test button.
- Feature runtime: features with background work start and stop as they're
  switched on and off, with their own migrations.
- The Overview is now made of cards that each feature supplies, with details
  that slide in when you tap one: Internet, Home server, Library, First aid,
  Map, Messages, Power and Emergency.
- Internet feature: checks once a minute whether the internet, DNS and GitHub
  answer, with "Check again". It can be switched off, since it contacts
  outside hosts.
- Home server card with real figures: storage, memory (read from what's
  actually available, not what Linux keeps as cache), processor load, uptime
  and version.
- Emergency card with Australian numbers (000, Poisons 13 11 26, SES 132 500,
  healthdirect), tappable on phones.
- On phones, the header keeps the logo and Settings on one row and the menu
  scrolls sideways.

- TanStack Start app with the Beacon design: Overview and Settings, with fonts
  bundled so it looks right offline.
- Feature modules: Library, First aid, Map, Messages, Power and Emergency, each
  with a manifest, a page and a guarded route. Switch them on and off in
  Settings, or lock them with `OUTPOST_FEATURES` in `.env`. Features can
  require others.
- Platform updates in the WattsMyPower style: nightly, beta and stable
  channels, a 6-hourly GitHub check, one-tap install from Settings through a
  host-side `updater.sh`, backups before every update, and `--rollback`.
- `install.sh` for first installs, updates, rollback and uninstall.
- `scripts/proxmox-lxc.sh`, a Proxmox VE helper run from the host: a Default
  or Advanced menu (storage with free space, DHCP or static IP, VLAN, channel,
  password, SSH keys), recommended specs of 4 cores, 4 GB RAM and 250 GB for
  Wikipedia with pictures, Summary notes with the address, and `--update`,
  `--rollback` and `--status` for existing containers.
- SQLite with per-feature migration namespaces, a settings store, and a JSON
  API with cross-site protection.
- CI: typecheck, tests, build, ShellCheck, and Docker builds for amd64 and
  arm64. Daily CalVer on main, and `scripts/release.sh` for beta and stable tags.

### Fixed

- Files Kiwix sends compressed (scripts, pages) were cut short by the Library's
  proxy, breaking "Original layout" pages and offline maps. Proxied files now
  revalidate with Kiwix instead of being cached for a day.
