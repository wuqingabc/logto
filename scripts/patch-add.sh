#!/usr/bin/env bash
# Usage: bash scripts/patch-add.sh "feat: short description"
set -euo pipefail
source "$(dirname "$0")/env.sh"

MSG="${1:?Usage: $0 \"commit message\"}"

cd "$UPSTREAM_DIR"
git add -A
git commit -m "$MSG"

# 找下一个 patch 编号
LAST=$(ls -1 ../patches/[0-9]*.patch 2>/dev/null | sort -V | tail -1 || echo "")
if [ -z "$LAST" ]; then
  NUM="0001"
else
  N=$(basename "$LAST" | sed -E 's/^([0-9]+)-.*/\1/')
  NUM=$(printf "%04d" "$((10#$N + 1))")
fi

git format-patch -1 -o ../patches --start-number "$NUM"
NEW=$(ls -1t ../patches/*.patch | head -1 | xargs basename)
echo "$NEW" >> ../patches/series

echo "✓ patch added: patches/$NEW"
echo "  remember to bump WINAMZ_BUILD_N + rebuild image"
