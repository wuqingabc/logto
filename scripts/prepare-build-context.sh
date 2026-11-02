#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
context=${1:?Build context path required}
mkdir -p "$context"
rsync -a --exclude=.git --exclude=node_modules --exclude='.env*' --exclude=build --exclude=lib --exclude=dist --exclude=coverage --exclude=.playwright-cli "$UPSTREAM_DIR/" "$context/"
cp "$DOCKERFILE" "$context/Dockerfile.winamz"
python3 - "$context" <<'PYTHON'
from pathlib import Path
import shutil,sys
root=Path(sys.argv[1]);deps=root/'.deps';deps.mkdir(exist_ok=True)
for name in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc']:
 shutil.copy2(root/name,deps/name)
for p in (root/'packages').rglob('*'):
 if not p.is_file():continue
 if p.name in ['package.json','package.extend.json'] or p.name.startswith('logo'):
  target=deps/p.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
shutil.copytree(root/'packages/connectors/templates',deps/'packages/connectors/templates',dirs_exist_ok=True)
PYTHON
