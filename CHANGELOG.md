# Changelog

All notable changes to Outpost. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions are
CalVer (`YYYY.M.D`).

## [Unreleased]

### Added

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
