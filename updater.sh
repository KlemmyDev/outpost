#!/usr/bin/env bash
# Runs on the host every minute from cron (install.sh sets this up). The app
# can't touch Docker or the code: it only drops data/update/request. This
# script notices, runs `install.sh --yes`, and reports back through
# data/update/status.json and update.log. See src/platform/updates/protocol.ts.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

U=data/update
STALE_REQUEST=900   # seconds; older requests are ignored (matches protocol.ts)
STALE_LOCK=60       # minutes; a lock older than this is from a crashed run
mkdir -p "$U"

now() { date +%s; }
json_str() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')"; }
put() { # put <file> <json>: write whole, then rename
  printf '%s\n' "$2" >"$U/$1.tmp" && chmod 644 "$U/$1.tmp" && mv -f "$U/$1.tmp" "$U/$1"
}

why=""
if ! command -v git >/dev/null 2>&1; then
  why="git isn't installed on the host."
elif ! docker info >/dev/null 2>&1 && ! sudo -n docker info >/dev/null 2>&1; then
  why="Docker can't be used without a password by the user running the updater."
elif [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  why="The Outpost folder on the host has local changes, so it won't update over them."
fi

can=true; [ -n "$why" ] && can=false
put updater.json "{\"seen_at\": $(now), \"can_update\": $can, \"why\": $(json_str "$why")}"

[ -f "$U/request" ] || exit 0

if ! mkdir "$U/.running" 2>/dev/null; then
  if [ -n "$(find "$U/.running" -maxdepth 0 -mmin +$STALE_LOCK 2>/dev/null)" ]; then
    rm -rf "$U/.running" && mkdir "$U/.running" || exit 0
  else
    exit 0
  fi
fi
trap 'rm -rf "$U/.running"' EXIT

requested=$(stat -c %Y "$U/request" 2>/dev/null || stat -f %m "$U/request")
rm -f "$U/request"
from=$(git rev-parse HEAD 2>/dev/null || echo "")
started=$(now)

if [ $((started - requested)) -gt $STALE_REQUEST ]; then
  put status.json "{\"state\": \"expired\", \"requested_at\": $requested, \"finished_at\": $started, \"from\": $(json_str "$from"), \"error\": \"The request was too old to act on.\"}"
  exit 0
fi
if [ -n "$why" ]; then
  put status.json "{\"state\": \"failed\", \"requested_at\": $requested, \"finished_at\": $started, \"from\": $(json_str "$from"), \"error\": $(json_str "$why")}"
  exit 0
fi

put status.json "{\"state\": \"running\", \"requested_at\": $requested, \"started_at\": $started, \"from\": $(json_str "$from")}"
bash ./install.sh --yes >"$U/update.log" 2>&1
code=$?
to=$(git rev-parse HEAD 2>/dev/null || echo "")

if [ $code -eq 0 ]; then
  put status.json "{\"state\": \"done\", \"requested_at\": $requested, \"started_at\": $started, \"finished_at\": $(now), \"from\": $(json_str "$from"), \"to\": $(json_str "$to")}"
else
  put status.json "{\"state\": \"failed\", \"requested_at\": $requested, \"started_at\": $started, \"finished_at\": $(now), \"from\": $(json_str "$from"), \"to\": $(json_str "$to"), \"error\": \"install.sh stopped (exit $code): see data/update/update.log\"}"
fi
