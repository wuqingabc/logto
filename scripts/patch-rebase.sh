#!/usr/bin/env bash
# Usage: bash scripts/patch-rebase.sh v3.11.0
set -euo pipefail
source "$(dirname "$0")/env.sh"

NEW_VERSION="${1:?Usage: $0 <new-upstream-version>}"

cd "$UPSTREAM_DIR"
git fetch --tags
git reset --hard "$NEW_VERSION"

if [ ! -f ../patches/series ] || [ ! -s ../patches/series ]; then
  echo "✓ no patches to rebase"
else
  while IFS= read -r patch; do
    [ -z "$patch" ] && continue
    [[ "$patch" =~ ^# ]] && continue
    echo "==> rebasing $patch onto $NEW_VERSION"
    if ! git am --3way "../patches/$patch"; then
      echo ""
      echo "✗ Conflict in $patch."
      echo "  Resolve manually, then:"
      echo "    git add -A && git am --continue"
      echo "    git format-patch HEAD~1 -o ../patches  # overwrites the patch"
      echo "  Then re-run this script with remaining patches."
      exit 1
    fi
  done < ../patches/series
fi

echo ""
echo "✓ all patches re-applied on $NEW_VERSION"
echo "  next: update UPSTREAM_VERSION in scripts/env.sh + bump image tag"
