#!/usr/bin/env bash
# Outpost installer, updater and rollback, in one script.
#
# First install (Debian/Ubuntu, a Proxmox LXC, or any Linux with Docker):
#   curl -fsSL https://raw.githubusercontent.com/KlemmyDev/outpost/main/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --channel stable
#
# Then, from the app folder:
#   bash install.sh              update to the newest release on your channel
#   bash install.sh --yes        the same, without questions (what updater.sh runs)
#   bash install.sh --channel X  switch channel (nightly, beta, stable) and update
#   bash install.sh --rollback   go back to the version before the last update
#   bash install.sh --start      start Outpost without updating
#   bash install.sh --uninstall  remove the containers and images, keep data/ and .env
#
# The tag rule in channel_tag() must match src/platform/updates/channels.ts.
set -euo pipefail

REPO="${OUTPOST_REPO:-KlemmyDev/outpost}"
CONTAINER=outpost
IMAGE=outpost
CRON_TAG='# Outpost: updates from the dashboard'
ORIGINAL_ARGS=("$@")

CHANNEL_FLAG="" YES=0 NO_PULL=0 NO_BACKUP=0 NO_DASHBOARD_UPDATES=0 MODE=update

usage() { sed -n '2,17p' "${BASH_SOURCE[0]:-install.sh}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --channel) CHANNEL_FLAG="${2:-}"; shift ;;
    --channel=*) CHANNEL_FLAG="${1#*=}" ;;
    --yes|-y) YES=1 ;;
    --no-pull) NO_PULL=1 ;;
    --no-backup) NO_BACKUP=1 ;;
    --no-dashboard-updates) NO_DASHBOARD_UPDATES=1 ;;
    --rollback) MODE=rollback ;;
    --uninstall) MODE=uninstall ;;
    --start) MODE=start ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

if [ -t 1 ]; then B=$'\033[1m' D=$'\033[2m' R=$'\033[31m' Y=$'\033[33m' G=$'\033[32m' N=$'\033[0m'; else B='' D='' R='' Y='' G='' N=''; fi
say()  { printf '%s==>%s %s\n' "$B" "$N" "$*"; }
note() { printf '    %s%s%s\n' "$D" "$*" "$N"; }
warn() { printf '%s!!%s  %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '%sxx%s  %s\n' "$R" "$N" "$*" >&2; exit 1; }

# Questions go to the terminal even when the script itself is piped from curl.
ask() { # ask "Question" default -> answer
  local answer=""
  if [ "$YES" -eq 1 ] || ! [ -r /dev/tty ]; then printf '%s' "$2"; return; fi
  printf '%s [%s]: ' "$1" "$2" >/dev/tty
  read -r answer </dev/tty || true
  printf '%s' "${answer:-$2}"
}
confirm() { # confirm "Question" -> 0 for yes
  [ "$YES" -eq 1 ] && return 0
  [ -r /dev/tty ] || return 1
  local answer
  printf '%s [Y/n]: ' "$1" >/dev/tty
  read -r answer </dev/tty || true
  case "${answer:-y}" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO=sudo

apt_install() {
  command -v apt-get >/dev/null 2>&1 || die "Please install $* and run this again."
  confirm "Install $* with apt-get?" || die "Outpost needs $*."
  $SUDO apt-get update -qq
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq "$@"
}

# --- Bootstrap: when piped from curl, clone the app and run that copy --------
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -z "$SCRIPT_DIR" ] || [ ! -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  command -v git >/dev/null 2>&1 || apt_install git ca-certificates
  TARGET="${OUTPOST_DIR:-$PWD/outpost}"
  if [ -d "$TARGET/.git" ]; then
    say "Using the existing Outpost folder at $TARGET"
  else
    say "Downloading Outpost into $TARGET"
    git clone --quiet --branch main "https://github.com/$REPO.git" "$TARGET"
  fi
  exec bash "$TARGET/install.sh" "${ORIGINAL_ARGS[@]}"
fi
cd "$SCRIPT_DIR"
DIR="$SCRIPT_DIR"
command -v git >/dev/null 2>&1 || apt_install git ca-certificates

mkdir -p data/update data/backups data/library
chmod 700 data 2>/dev/null || true

# --- Channel ------------------------------------------------------------------
CHANNEL_FILE=data/update/channel
if [ -n "$CHANNEL_FLAG" ]; then
  case "$CHANNEL_FLAG" in nightly|beta|stable) ;; *) die "Channel must be nightly, beta or stable." ;; esac
  printf '%s\n' "$CHANNEL_FLAG" >"$CHANNEL_FILE.tmp" && chmod 644 "$CHANNEL_FILE.tmp" && mv -f "$CHANNEL_FILE.tmp" "$CHANNEL_FILE"
fi
if [ -f "$CHANNEL_FILE" ]; then CHANNEL="$(tr -d '[:space:]' <"$CHANNEL_FILE")"; else CHANNEL=beta; fi
case "$CHANNEL" in nightly|beta|stable) ;; *) CHANNEL=beta ;; esac
[ -f "$CHANNEL_FILE" ] || { printf '%s\n' "$CHANNEL" >"$CHANNEL_FILE"; chmod 644 "$CHANNEL_FILE"; }

# Newest tag on a channel. stable: vX.Y.Z only. beta: also vX.Y.Z-beta[.N].
channel_tag() {
  local pattern='^v[0-9]+(\.[0-9]+)*$'
  [ "$1" = beta ] && pattern='^v[0-9]+(\.[0-9]+)*(-beta(\.[0-9]+)?)?$'
  git -c versionsort.suffix=-beta tag -l 'v[0-9]*' --sort=-v:refname | grep -E "$pattern" | head -n 1 || true
}

pkg_version() { sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1; }

# --- Code ---------------------------------------------------------------------
update_code() {
  [ "$NO_PULL" -eq 1 ] && return
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    die "The Outpost folder has local changes, so it won't update over them. See: git status"
  fi
  say "Fetching updates ($CHANNEL channel)"
  git fetch --quiet --tags --force --prune --prune-tags origin
  local before after tag
  before="$(git rev-parse HEAD)"
  if [ "$CHANNEL" = nightly ]; then
    follow_main
  else
    tag="$(channel_tag "$CHANNEL")"
    if [ -z "$tag" ]; then
      warn "No $CHANNEL release has been published yet, so following main for now."
      follow_main
    else
      git checkout --quiet --detach "refs/tags/$tag"
      note "release $tag"
    fi
  fi
  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    note "already on the newest $CHANNEL code ($(git rev-parse --short HEAD))"
  elif git merge-base --is-ancestor "$before" "$after"; then
    note "new since last time:"
    git log --oneline --first-parent --no-decorate "$before..$after" | grep -v ' Version [0-9]' | head -n 20 | sed 's/^/      /' || true
  else
    warn "Going back to an earlier version for the $CHANNEL channel."
  fi
  # This script may itself have changed: run the new copy for the rest.
  if [ "$before" != "$after" ] && ! git diff --quiet "$before" "$after" -- install.sh; then
    note "install.sh changed, continuing with the new one"
    exec bash ./install.sh --no-pull "${ORIGINAL_ARGS[@]}"
  fi
}

follow_main() {
  if git show-ref --verify --quiet refs/heads/main; then git checkout --quiet main; else git checkout --quiet -b main origin/main; fi
  git merge --quiet --ff-only origin/main
}

# --- Docker -------------------------------------------------------------------
DOCKER="" DC=""
ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    confirm "Docker isn't installed. Install it now from get.docker.com?" || die "Outpost runs in Docker."
    command -v curl >/dev/null 2>&1 || apt_install curl ca-certificates
    curl -fsSL https://get.docker.com | $SUDO sh
  fi
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  fi
  if docker info >/dev/null 2>&1; then DOCKER=docker
  elif [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then DOCKER="$SUDO docker"
  else die "Can't talk to Docker. Is it running? On a Proxmox LXC, turn on Options > Features > nesting."
  fi
  if $DOCKER compose version >/dev/null 2>&1; then DC="$DOCKER compose"
  elif command -v docker-compose >/dev/null 2>&1; then DC="${SUDO:+$SUDO }docker-compose"
  else die "Docker Compose is missing. Install the docker-compose-plugin package."
  fi
}

running() { [ -n "$($DOCKER ps -q --filter "name=^/${CONTAINER}$" --filter status=running 2>/dev/null)" ]; }
running_commit() {
  $DOCKER inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" 2>/dev/null | sed -n 's/^GIT_COMMIT=//p' | head -n 1
}

# --- Settings -----------------------------------------------------------------
setup_env() {
  if [ ! -f .env ]; then
    say "First-time setup"
    cp .env.example .env
    local tz port
    tz="$( (timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null) | head -n 1)"
    tz="$(ask "Time zone" "${tz:-Australia/Brisbane}")"
    port="$(ask "Web port" "3000")"
    sed -i.bak -e "s|^TZ=.*|TZ=$tz|" -e "s|^PORT=.*|PORT=$port|" .env && rm -f .env.bak
  fi
  chmod 600 .env
}

port() { sed -n 's/^PORT=//p' .env 2>/dev/null | head -n 1; }

# --- Backups ------------------------------------------------------------------
LAST_BACKUP=""
backup() {
  [ "$NO_BACKUP" -eq 1 ] && { warn "Skipping the database backup (--no-backup)."; return; }
  [ -f data/outpost.db ] || { note "no database yet, nothing to back up"; return; }
  local name
  name="outpost-$(date +%Y%m%d-%H%M%S)-$(pkg_version)-$CHANNEL.db"
  say "Backing up the database"
  if running; then
    $DOCKER exec "$CONTAINER" node /app/docker/backup.mjs "/data/backups/$name" >/dev/null \
      || die "The backup failed, so the update was stopped. Nothing has changed."
  elif command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 data/outpost.db ".backup 'data/backups/$name'" || die "The backup failed, so the update was stopped."
  else
    cp data/outpost.db "data/backups/$name"
    [ -f data/outpost.db-wal ] && cp data/outpost.db-wal "data/backups/$name-wal"
  fi
  [ -s "data/backups/$name" ] || die "The backup came out empty, so the update was stopped."
  LAST_BACKUP="data/backups/$name"
  note "$LAST_BACKUP"
  # Keep the newest 10, plus whatever a rollback would need.
  local keep
  keep="$(sed -n 's/^backup=//p' data/update/previous 2>/dev/null || true)"
  { ls -1t data/backups/outpost-*.db 2>/dev/null || true; } | tail -n +11 | while read -r old; do
    [ "$old" = "$keep" ] || rm -f "$old" "$old-wal"
  done || true
}

# --- Dashboard updates --------------------------------------------------------
setup_updater() {
  if [ "$NO_DASHBOARD_UPDATES" -eq 1 ]; then
    remove_updater
    note "dashboard updates are off; update with: bash $DIR/install.sh"
    return
  fi
  command -v crontab >/dev/null 2>&1 || apt_install cron
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    $SUDO systemctl enable --now cron >/dev/null 2>&1 || true
  fi
  local line="* * * * * bash \"$DIR/updater.sh\" >/dev/null 2>&1 $CRON_TAG"
  (crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true; printf '%s\n' "$line") | crontab -
}
remove_updater() {
  command -v crontab >/dev/null 2>&1 || return 0
  (crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true) | crontab -
}

# --- Build, start and check -----------------------------------------------------
keep_previous() {
  local old_commit new_commit
  old_commit="$(running_commit || true)"
  new_commit="$(git rev-parse HEAD)"
  [ -n "$old_commit" ] && [ "$old_commit" != "$new_commit" ] || return 0
  $DOCKER image inspect "$IMAGE:latest" >/dev/null 2>&1 || return 0
  $DOCKER tag "$IMAGE:latest" "$IMAGE:previous"
  local old_version
  old_version="$($DOCKER exec "$CONTAINER" node -p "require('/app/package.json').version" 2>/dev/null || echo unknown)"
  {
    echo "commit=$old_commit"
    echo "version=$old_version"
    echo "backup=$LAST_BACKUP"
    echo "when=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >data/update/previous.tmp && mv -f data/update/previous.tmp data/update/previous
  note "kept $old_version for rollback"
}

build_and_start() {
  export GIT_COMMIT
  GIT_COMMIT="$(git rev-parse HEAD)"
  say "Building Outpost $(pkg_version) ($(git rev-parse --short HEAD))"
  $DC build --build-arg "GIT_COMMIT=$GIT_COMMIT"
  say "Starting"
  $DC up -d --remove-orphans
  $DOCKER image prune -f >/dev/null 2>&1 || true
}

wait_healthy() {
  say "Waiting for Outpost to answer"
  local _
  for _ in $(seq 1 45); do
    if $DOCKER exec "$CONTAINER" node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      local ip
      ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
      printf '\n%sOutpost is running:%s http://%s:%s\n\n' "$G$B" "$N" "${ip:-localhost}" "$(port)"
      return 0
    fi
    sleep 2
  done
  warn "Outpost didn't answer within 90 seconds. The last log lines:"
  $DC logs --tail=30 "$CONTAINER" >&2 || true
  [ -f data/update/previous ] && warn "To go back to the previous version: bash $DIR/install.sh --rollback"
  exit 1
}

# --- Modes ----------------------------------------------------------------------
rollback() {
  [ -f data/update/previous ] || die "There's no earlier version to go back to."
  local commit version saved
  commit="$(sed -n 's/^commit=//p' data/update/previous)"
  version="$(sed -n 's/^version=//p' data/update/previous)"
  saved="$(sed -n 's/^backup=//p' data/update/previous)"
  say "Going back to $version (${commit:0:7})"
  backup
  $DC stop
  if [ -n "$saved" ] && [ -f "$saved" ]; then
    note "restoring the database from $saved (changes since the update are kept in $LAST_BACKUP)"
    cp "$saved" data/outpost.db.restoring
    rm -f data/outpost.db-wal data/outpost.db-shm
    mv -f data/outpost.db.restoring data/outpost.db
  fi
  git checkout --quiet --detach "$commit"
  export GIT_COMMIT="$commit"
  if $DOCKER image inspect "$IMAGE:previous" >/dev/null 2>&1; then
    $DOCKER tag "$IMAGE:previous" "$IMAGE:latest"
    $DC up -d --no-build --force-recreate
  else
    $DC build --build-arg "GIT_COMMIT=$commit" && $DC up -d --force-recreate
  fi
  rm -f data/update/previous
  wait_healthy
  warn "Dashboard updates will move you forward again. To stay here, pick another channel or run: bash install.sh --no-dashboard-updates"
}

uninstall() {
  confirm "Remove Outpost's containers and images? Your data/ folder and .env are kept." || exit 0
  $DC down --rmi local || true
  $DOCKER image rm "$IMAGE:previous" >/dev/null 2>&1 || true
  remove_updater
  say "Removed. Your data is still in $DIR/data. Delete the folder to remove everything."
}

# --- Main -----------------------------------------------------------------------
case "$MODE" in
  rollback) ensure_docker; rollback ;;
  uninstall) ensure_docker; uninstall ;;
  start) ensure_docker; setup_env; $DC up -d; wait_healthy ;;
  update)
    update_code
    ensure_docker
    setup_env
    backup
    setup_updater
    keep_previous
    build_and_start
    wait_healthy
    ;;
esac
