#!/bin/sh
# Starts as root only to fix ownership of /data, then drops to the user that
# owns ./data on the host (or uid 10001 if that's root), so files Outpost
# writes stay readable by the host user who runs install.sh and updater.sh.
set -eu
umask 077

mkdir -p /data /data/update /data/backups /data/library

if [ "$(id -u)" = "0" ]; then
  uid=$(stat -c %u /data)
  gid=$(stat -c %g /data)
  if [ "$uid" = "0" ]; then uid=10001; gid=10001; fi
  chown -R "$uid:$gid" /data
  # The updater on the host must be able to read and replace the update files.
  chmod 755 /data/update 2>/dev/null || true
  # Kiwix runs as its own user and reads the library folder.
  chmod 755 /data/library 2>/dev/null || true
  exec setpriv --reuid "$uid" --regid "$gid" --clear-groups -- "$@"
fi

exec "$@"
