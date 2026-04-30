#!/usr/bin/env bash
# 在 upstream/ 工作树上应用所有 patches（开发态）
set -euo pipefail
source "$(dirname "$0")/env.sh"

cd "$UPSTREAM_DIR"
git reset --hard "$UPSTREAM_VERSION"

if [ ! -f ../patches/series ] || [ ! -s ../patches/series ]; then
  echo "✓ no patches/series file or empty, nothing to apply"
  exit 0
fi

while IFS= read -r patch; do
  [ -z "$patch" ] && continue
  [[ "$patch" =~ ^# ]] && continue
  echo "==> applying $patch"
  git am --3way "../patches/$patch"
done < ../patches/series

echo "✓ all patches applied"
