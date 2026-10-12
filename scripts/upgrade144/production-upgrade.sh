#!/usr/bin/env bash
# PREPARED ONLY. Invoke on production host only after final candidate approval.
# Stops Logto, proves the final backup, migrates and verifies; leaves app stopped.
set -euo pipefail
umask 077
image=${1:?Usage: production-upgrade.sh APPROVED_IMAGE [BACKUP_DIR]}
backup_dir=${2:-/srv/winamz/backups/logto144-20261012}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
[[ $(id -u) == 0 && "$backup_dir" == /srv/winamz/backups/logto144-* ]] || exit 1
[[ $(stat -c '%a' "$backup_dir/production-migration.env") == 600 ]] || exit 1
candidate_id=$(docker image inspect --format '{{.Id}}' "$image")
[[ $(cat "$backup_dir/clone-approved-image.id") == "$candidate_id" ]] || { echo 'Candidate image lacks matching clone approval evidence' >&2; exit 1; }
[[ $(sudo -u postgres psql -X -At -d logto -c "select value->>'timestamp' from systems where key='alterationState'") == 1781448279 ]] || { echo 'Production state differs; inspect instead of rewinding again' >&2; exit 1; }
[[ $(sudo -u postgres psql -X -At -d logto -c "select count(*) from pg_roles where rolname='logto_tenant_logto' and not rolsuper and not rolcanlogin") == 1 ]] || exit 1
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' winamz-logto) == winamz ]] || exit 1
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' winamz-logto) == /srv/winamz/docker-compose.yml ]] || exit 1
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' winamz-logto) == logto ]]
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' winamz-core) == winamz-core ]] || exit 1
python3 - "$backup_dir/production-migration.env" <<'PY'
import sys,urllib.parse
values=dict(line.rstrip('\n').split('=',1) for line in open(sys.argv[1]) if '=' in line)
url=urllib.parse.urlsplit(values['DB_URL'])
assert url.path=='/logto' and url.hostname=='172.17.0.1', 'Unexpected production DB target'
PY
stamp=$(date -u +%Y%m%dT%H%M%SZ)
release="$backup_dir/final-$stamp"
install -d -m 700 "$release"
proof_db="logto_restoreproof_144_$(date -u +%Y%m%d%H%M%S)"
printf '%s\n' "$candidate_id" > "$release/candidate-image.id"
docker inspect --format '{{.Image}}' winamz-logto > "$release/original-image.id"
docker inspect winamz-core > "$release/original-core-container.json"
docker inspect --format '{{.State.Running}}' winamz-core > "$release/original-core-running.txt"
docker inspect winamz-logto > "$release/original-container.json"
cp /srv/winamz/docker-compose.yml "$release/original-compose.yml"
cp /srv/winamz/.env "$release/original.env"
chmod 600 "$release/original-compose.yml" "$release/original.env"
printf '%s\n' "$proof_db" > "$release/restoreproof-database.txt"
printf '%s\n' "$release" > "$backup_dir/production-release-active.txt"
# A failure after this point deliberately keeps Logto stopped for inspection.
python3 "$script_dir/production-fence.py" install "$release"
nginx -t > "$release/nginx-fence-test.log" 2>&1
nginx -s reload
for host in auth.winamz.com console.winamz.com; do
  fenced=false
  for attempt in {1..10}; do
    if status=$(curl --noproxy '*' --connect-timeout 5 --max-time 10 -sS -o /dev/null -w '%{http_code}' "https://$host/") && [[ "$status" == 503 ]]; then fenced=true; break; fi
    sleep 1
  done
  [[ "$fenced" == true ]] || { echo 'Public maintenance fence not verified' >&2; exit 1; }
done
touch "$release/public-fence.verified"
docker stop --time 60 winamz-core winamz-logto > "$release/container-stop.log"
[[ $(docker inspect --format '{{.State.Running}}' winamz-logto) == false && $(docker inspect --format '{{.State.Running}}' winamz-core) == false ]] || exit 1
remaining=$(sudo -u postgres psql -X -At -d postgres -c "select count(*) from pg_stat_activity where datname='logto' and backend_type='client backend'")
[[ "$remaining" == 0 ]] || { echo 'Other database clients remain; keep writers paused and inspect' >&2; exit 1; }
sudo -u postgres psql -X -At -d postgres -c "select jsonb_build_object('database',d.datname,'owner',pg_get_userbyid(d.datdba),'acl',d.datacl,'settings',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from pg_db_role_setting s where s.setdatabase=d.oid)) from pg_database d where d.datname='logto'" > "$release/original-database-attributes.json"
python3 - "$release/original-database-attributes.json" <<'PYDB'
import json,sys
metadata=json.load(open(sys.argv[1]))
assert metadata['owner']=='logto' and metadata['acl'] is None and metadata['settings']==[], 'Non-default database metadata needs explicit restoration support'
PYDB
sudo -u postgres psql -X -d logto < "$script_dir/invariants.sql" > "$release/final-before.txt"
sudo -u postgres pg_dump -Fc -d logto > "$release/final.dump"
sha256sum "$release/final.dump" > "$release/final.dump.sha256"
sudo -u postgres pg_restore --list < "$release/final.dump" > "$release/final.dump.list"
sudo -u postgres createdb -O logto "$proof_db"
sudo -u postgres pg_restore --exit-on-error -d "$proof_db" < "$release/final.dump" > "$release/restoreproof.log" 2>&1
# Restore proof is read-only: no role remapping, app startup, CLI, or migration.
sudo -u postgres psql -X -d "$proof_db" < "$script_dir/invariants.sql" > "$release/restoreproof.txt"
python3 "$script_dir/compare-invariants.py" "$release/final-before.txt" "$release/restoreproof.txt" > "$release/restoreproof-compare.log"
[[ $(sudo -u postgres psql -X -At -d postgres -c "select count(*) from pg_stat_activity where datname='logto' and backend_type='client backend'") == 0 ]] || exit 1
python3 "$script_dir/production-fence.py" verify "$release"
touch "$release/backup-restore-proof.passed"
sudo -u postgres psql -X -d logto -v expected_database=logto < "$script_dir/rewind-verified-boundary.sql" > "$release/production-rewind.log" 2>&1
docker run --rm --network host --env-file "$backup_dir/production-migration.env" --entrypoint node "$candidate_id" packages/cli/bin/logto.js database alteration deploy 1.44.0 > "$release/production-alteration.log" 2>&1
sudo -u postgres psql -X -d logto < "$script_dir/invariants.sql" > "$release/production-after.txt"
python3 "$script_dir/compare-invariants.py" "$release/final-before.txt" "$release/production-after.txt" > "$release/production-compare.log"
sudo -u postgres psql -X -d logto < "$script_dir/schema-gates.sql" > "$release/production-schema-gates.txt"
touch "$release/migration-gates.passed"
printf 'Production migration gates passed; app remains stopped. Private release directory: %s\n' "$release"
printf 'Use Compose for final cutover while nginx fence remains. Run production-resume.sh %s only after local TLS/auth/Core review; it marks writes resumed before reopening ingress.\n' "$release"
