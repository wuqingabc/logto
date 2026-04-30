#!/usr/bin/env bash
# 首次部署 / CI 拉代码后跑：拉 submodule + checkout pin tag
set -euo pipefail
source "$(dirname "$0")/env.sh"

git submodule update --init --recursive
cd "$UPSTREAM_DIR"
git fetch --tags
git checkout "$UPSTREAM_VERSION"
echo "✓ $UPSTREAM_DIR @ $UPSTREAM_VERSION"
