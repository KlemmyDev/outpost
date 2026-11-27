#!/bin/sh
# Runs inside the kiwix-serve container. Keeps Kiwix's library list in step
# with the ZIM files in /zim (which Outpost downloads into ./data/library) and
# serves them. Files can also be copied into ./data/library by hand; they're
# picked up within a few seconds. Half-downloaded files end in .part and are
# ignored.
set -u

ZIM_DIR=${ZIM_DIR:-/zim}
LIB=${LIB:-/tmp/library.xml}
EMPTY='<library version="20110515">
</library>'

# A fingerprint of the ZIM files: names, sizes and times.
state() {
  for f in "$ZIM_DIR"/*.zim; do
    [ -e "$f" ] && stat -c '%n %s %Y' "$f"
  done | md5sum
}

# Rebuilds the list from scratch, then swaps it in; kiwix-serve reloads it.
rebuild() {
  tmp="$LIB.new"
  printf '%s\n' "$EMPTY" > "$tmp"
  n=0
  for f in "$ZIM_DIR"/*.zim; do
    [ -e "$f" ] || continue
    if kiwix-manage "$tmp" add "$f" >/dev/null 2>&1; then n=$((n + 1)); else echo "[kiwix] skipping $f: not a readable ZIM file"; fi
  done
  mv "$tmp" "$LIB"
  echo "[kiwix] library has $n book(s)"
}

rebuild
last=$(state)
(
  while sleep 5; do
    now=$(state)
    if [ "$now" != "$last" ]; then
      # Wait for a file that's still being copied in to settle.
      sleep 2
      [ "$(state)" = "$now" ] || continue
      rebuild
      last=$now
    fi
  done
) &

exec kiwix-serve --port="${PORT:-8080}" --monitorLibrary --skipInvalid --library "$LIB"
