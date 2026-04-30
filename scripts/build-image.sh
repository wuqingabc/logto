#!/usr/bin/env bash
# Usage: WINAMZ_BUILD_N=1 bash scripts/build-image.sh
set -euo pipefail
source "$(dirname "$0")/env.sh"

WINAMZ_BUILD_N="${WINAMZ_BUILD_N:-0}"
TAG="${UPSTREAM_VERSION}-winamz.${WINAMZ_BUILD_N}"

echo "==> applying patches..."
bash "$(dirname "$0")/patch-apply.sh"

echo "==> building winamz/$IMAGE_NAME:$TAG"
docker build -f "$DOCKERFILE" -t "winamz/$IMAGE_NAME:$TAG" "$UPSTREAM_DIR"

echo ""
echo "✓ built: winamz/$IMAGE_NAME:$TAG"
echo "  to use: update docker-compose.yml image tag, then: docker compose up -d"
