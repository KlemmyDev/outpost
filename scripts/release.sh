#!/usr/bin/env bash
# Cuts a beta or stable release by tagging a commit that's already on main.
#
#   scripts/release.sh beta            tag origin/main as vYYYY.M.D-beta (then -beta.2, …)
#   scripts/release.sh stable [ref]    tag a commit as vYYYY.M.D
#   options: --skip-ci  --yes
#
# Installs on the beta/stable channels pick the new tag up on their next check.
# The tag rule must match src/platform/updates/channels.ts and install.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

CHANNEL="${1:-}"; shift || true
REF=origin/main SKIP_CI=0 YES=0
for arg in "$@"; do
  case "$arg" in
    --skip-ci) SKIP_CI=1 ;;
    --yes) YES=1 ;;
    *) REF="$arg" ;;
  esac
done
case "$CHANNEL" in beta|stable) ;; *) echo "usage: scripts/release.sh beta|stable [ref] [--skip-ci] [--yes]" >&2; exit 2 ;; esac

git fetch --quiet --tags origin
COMMIT="$(git rev-parse "$REF^{commit}")"
git merge-base --is-ancestor "$COMMIT" origin/main || { echo "$REF isn't on origin/main." >&2; exit 1; }

VERSION="$(git show "$COMMIT:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')"

if [ "$SKIP_CI" -eq 0 ]; then
  result="$(gh run list --workflow CI --commit "$COMMIT" --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"' 2>/dev/null || true)"
  [ "$result" = "completed success" ] || { echo "CI hasn't passed on ${COMMIT:0:7} (got: ${result:-no run}). Use --skip-ci to override." >&2; exit 1; }
fi

if [ "$CHANNEL" = stable ]; then
  TAG="v$VERSION"
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && { echo "$TAG already exists. Bump the version to $VERSION.1 first." >&2; exit 1; }
else
  TAG="v$VERSION-beta"; n=2
  while git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; do TAG="v$VERSION-beta.$n"; n=$((n + 1)); done
fi

pattern='^v[0-9]+(\.[0-9]+)*$'
[ "$CHANNEL" = beta ] && pattern='^v[0-9]+(\.[0-9]+)*(-beta(\.[0-9]+)?)?$'
PREVIOUS="$(git -c versionsort.suffix=-beta tag -l 'v[0-9]*' --sort=-v:refname | grep -E "$pattern" | head -n 1 || true)"

echo "Release $TAG on ${COMMIT:0:7} ($CHANNEL)"
if [ -n "$PREVIOUS" ]; then
  echo "Changes since $PREVIOUS:"
  git log --oneline --first-parent --no-decorate "$PREVIOUS..$COMMIT" | grep -v ' Version [0-9]' | sed 's/^/  /' || true
fi
if [ "$YES" -eq 0 ]; then
  read -r -p "Tag and publish? [y/N] " answer
  case "$answer" in [Yy]*) ;; *) exit 0 ;; esac
fi

label="Outpost $VERSION"; [ "$CHANNEL" = beta ] && label="$label (beta)"
git tag -a "$TAG" -m "$label" "$COMMIT"
git push origin "$TAG"

notes=(--generate-notes)
[ -n "$PREVIOUS" ] && notes+=(--notes-start-tag "$PREVIOUS")
if [ "$CHANNEL" = beta ]; then
  gh release create "$TAG" --verify-tag --title "$label" "${notes[@]}" --prerelease --latest=false
else
  gh release create "$TAG" --verify-tag --title "$label" "${notes[@]}" --latest
fi
echo "Published $TAG."
