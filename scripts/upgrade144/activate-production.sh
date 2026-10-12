#!/usr/bin/env bash
# Start the proven candidate while public ingress remains fenced.
set -euo pipefail
umask 077
backup_dir=${1:-/srv/winamz/backups/logto144-20261012}
release=$(cat "$backup_dir/production-release-active.txt")
[[ "$release" == "$backup_dir"/final-* && -f "$release/migration-gates.passed" ]] || exit 1
[[ -f "$release/public-fence.verified" ]] || exit 1
[[ ! -e "$release/writers-resumed" ]] || exit 1
candidate_id=$(docker image inspect --format '{{.Id}}' winamz/logto:v1.44.0-winamz.3)
[[ "$candidate_id" == "$(cat "$release/candidate-image.id")" ]] || exit 1
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/srv/winamz/.env'); s=p.read_text()
assert len(re.findall(r'^LOGTO_TAG=',s,re.M)) == 1
s=re.sub(r'^LOGTO_TAG=.*$', 'LOGTO_TAG=v1.44.0-winamz.3',s,flags=re.M)
p.write_text(s); p.chmod(0o600)
p=Path('/srv/winamz/docker-compose.yml');s=p.read_text()
m=re.search(r'^  logto:\s*\n(?:(?:    .*|\s*)\n)*',s,re.M);assert m
block=m.group(0)
assert block.count('      - TRUST_PROXY_HEADER=1\n') == 1
assert 'WINAMZ_SILENT_GRANT_' not in block
block=block.replace('      - TRUST_PROXY_HEADER=1\n', '''      - TRUST_PROXY_HEADER=1
      - WINAMZ_SILENT_GRANT_CLIENT_IDS=winamz-launcher-spa,winamz-buyer-spa,winamz-seller-spa
      - WINAMZ_SILENT_GRANT_AUDIENCES=https://api.winamz.com
      - WINAMZ_SILENT_GRANT_ORIGINS=tauri://localhost,http://tauri.localhost,https://tauri.localhost
''')
p.write_text(s[:m.start()]+block+s[m.end():])
PY
docker compose --project-directory /srv/winamz -p winamz --env-file /srv/winamz/.env -f /srv/winamz/docker-compose.yml config --quiet
docker compose --project-directory /srv/winamz -p winamz --env-file /srv/winamz/.env -f /srv/winamz/docker-compose.yml up -d --no-deps logto > "$release/candidate-start.log" 2>&1
[[ $(docker inspect --format '{{.Image}}' winamz-logto) == "$candidate_id" ]] || exit 1
ready=false
for attempt in $(seq 1 40); do
  if curl --noproxy '*' --silent --show-error --fail --resolve auth.winamz.com:443:127.0.0.1 https://auth.winamz.com/oidc/.well-known/openid-configuration > "$release/candidate-discovery.json" 2> "$release/candidate-discovery-error.log"; then
    ready=true; break
  fi
  sleep 2
done
[[ "$ready" == true ]] || exit 1
python3 - "$release/candidate-discovery.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]));assert d['issuer']=='https://auth.winamz.com/oidc'
assert d['token_endpoint']=='https://auth.winamz.com/oidc/token'
PY
curl --noproxy '*' --silent --show-error --fail --resolve auth.winamz.com:443:127.0.0.1 https://auth.winamz.com/oidc/jwks > "$release/candidate-jwks.json"
curl --noproxy '*' --silent --show-error --fail --resolve console.winamz.com:443:127.0.0.1 https://console.winamz.com/ > "$release/candidate-console.html"
touch "$release/candidate-local-health.passed"
echo 'Candidate is healthy locally; public ingress remains fenced pending acceptance.'
