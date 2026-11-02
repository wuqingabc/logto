#!/usr/bin/env bash
# Run on DB host. Only the isolated clone may be migrated by this wrapper.
set -euo pipefail
umask 077
image=${1:?Usage: rehearse-clone.sh IMAGE [BACKUP_DIR]}
backup_dir=${2:-/srv/winamz/backups/logto144-20261012}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
[[ "$backup_dir" == /srv/winamz/backups/logto144-* ]] || exit 1
[[ $(stat -c '%a' "$backup_dir/clone.env") == 600 ]] || { echo 'Clone env must be private0600' >&2; exit 1; }
# Parse env without printing it; cannot accidentally point clone migration at production.
python3 - "$backup_dir/clone.env" <<'PY'
import sys,urllib.parse
values=dict(line.rstrip('\n').split('=',1) for line in open(sys.argv[1]) if '=' in line)
assert urllib.parse.urlsplit(values['DB_URL']).path=='/logto_upgrade_144', 'Wrong database in clone environment'
PY
sudo -u postgres psql -X -d logto_upgrade_144 -v expected_database=logto_upgrade_144 < "$script_dir/rewind-verified-boundary.sql" > "$backup_dir/clone-rewind.log"
# `node` explicit entrypoint bypasses app startup and automatic seeding.
docker run --rm --network host --add-host host.docker.internal:host-gateway --env-file "$backup_dir/clone.env" --entrypoint node "$image" packages/cli/bin/logto.js database alteration --help > "$backup_dir/clone-cli-help.txt" 2>&1
docker run --rm --network host --add-host host.docker.internal:host-gateway --env-file "$backup_dir/clone.env" --entrypoint node "$image" packages/cli/bin/logto.js database alteration deploy 1.44.0 > "$backup_dir/clone-alteration.log" 2>&1
sudo -u postgres psql -X -d logto_upgrade_144 < "$script_dir/finalize-clone-permissions.sql" > "$backup_dir/clone-permissions-finalize.log" 2>&1
sudo -u postgres psql -X -d logto_upgrade_144 < "$script_dir/invariants.sql" > "$backup_dir/clone-after.txt"
python3 "$script_dir/compare-invariants.py" "$backup_dir/clone-before.txt" "$backup_dir/clone-after.txt"
sudo -u postgres psql -X -d logto_upgrade_144 < "$script_dir/schema-gates.sql" > "$backup_dir/clone-schema-gates.txt"
echo "Clone migrated and gates passed; private evidence in $backup_dir"
