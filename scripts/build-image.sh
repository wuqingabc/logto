#!/usr/bin/env bash
# Usage: WINAMZ_BUILD_N=1 bash scripts/build-image.sh
set -euo pipefail
source "$(dirname "$0")/env.sh"

WINAMZ_BUILD_N="${WINAMZ_BUILD_N:-0}"
TAG="${UPSTREAM_VERSION}-winamz.${WINAMZ_BUILD_N}"

echo "==> applying patches..."
bash "$(dirname "$0")/patch-apply.sh"

echo "==> building winamz/$IMAGE_NAME:$TAG"
context=$(mktemp -d "${TMPDIR:-/tmp}/winamz-logto-build.XXXXXXXX")
trap 'python3 -c "import shutil,sys; shutil.rmtree(sys.argv[1])" "$context"' EXIT
bash "$(dirname "$0")/prepare-build-context.sh" "$context"
docker build -f "$context/Dockerfile.winamz" \
  --build-arg "UPSTREAM_VERSION=$UPSTREAM_VERSION" \
  --build-arg "WINAMZ_BUILD_N=$WINAMZ_BUILD_N" \
  --build-arg "WINAMZ_REVISION=$(git rev-parse HEAD)" \
  -t "winamz/$IMAGE_NAME:$TAG" "$context"

echo ""
echo "✓ built: winamz/$IMAGE_NAME:$TAG"
echo "  to use: update docker-compose.yml image tag, then: docker compose up -d"
