#!/usr/bin/env bash
# Sets package.json's version to today's date in Brisbane (CalVer YYYY.M.D),
# if the current version is from an earlier day. Run by the "Version"
# workflow on every push to main. Prints the version.
set -euo pipefail
cd "$(dirname "$0")/.."

today="$(TZ=Australia/Brisbane date +%Y.%-m.%-d)"
current="$(node -p "require('./package.json').version")"

# Keep a hand-set ".N" for a second release on the same day.
case "$current" in
  "$today"|"$today".*) echo "$current"; exit 0 ;;
esac

node -e '
  const fs = require("fs")
  for (const file of ["package.json", "package-lock.json"]) {
    if (!fs.existsSync(file)) continue
    const json = JSON.parse(fs.readFileSync(file, "utf8"))
    json.version = process.argv[1]
    if (json.packages && json.packages[""]) json.packages[""].version = process.argv[1]
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n")
  }
' "$today"
echo "$today"
