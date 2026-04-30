#!/usr/bin/env bash
# 弃疗：把 upstream/ 重置回干净 pin tag（丢失任何未导出的本地改动）
set -euo pipefail
source "$(dirname "$0")/env.sh"

cd "$UPSTREAM_DIR"
git reset --hard "$UPSTREAM_VERSION"
git clean -fd
echo "✓ $UPSTREAM_DIR reset to clean $UPSTREAM_VERSION"
