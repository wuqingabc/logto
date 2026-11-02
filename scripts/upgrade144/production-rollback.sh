#!/usr/bin/env bash
# PREPARED ONLY. Exact paired recovery before upgraded writes are accepted.
# Preserves the failed DB and restores the final paused dump; uses original Compose.
set -euo pipefail
umask 077
release=${1:?Usage: production-rollback.sh FINAL_RELEASE_DIR}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
[[ $(id -u) == 0 && "$release" == /srv/winamz/backups/logto144-*/final-* ]] || exit 1
[[ -f "$release/backup-restore-proof.passed" && ! -e "$release/writers-resumed" ]] || { echo 'Recovery requires proven final snapshot and no upgraded writes; inspect reconciliation if writes resumed' >&2; exit 1; }
[[ ! -e "$release/recovery-started" ]] || { echo 'Recovery already attempted; inspect retained artifacts before retry' >&2; exit 1; }
sha256sum -c "$release/final.dump.sha256" > "$release/recovery-checksum.log"
old_id=$(cat "$release/original-image.id")
[[ "$old_id" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
docker image inspect "$old_id" > /dev/null
# The current service may already be candidate; stop through Compose without dependencies.
docker compose --project-directory /srv/winamz -p winamz --env-file /srv/winamz/.env -f /srv/winamz/docker-compose.yml stop --timeout 60 winamz-core logto > "$release/recovery-stop.log" 2>&1
[[ $(sudo -u postgres psql -X -At -d postgres -c "select count(*) from pg_stat_activity where datname='logto' and backend_type='client backend'") == 0 ]] || { echo 'Database clients remain; keep writers paused' >&2; exit 1; }
python3 "$script_dir/production-fence.py" verify "$release"
touch "$release/recovery-started"
stamp=$(date -u +%Y%m%d%H%M%S)
recovery_db="logto_recovery_144_$stamp"
failed_db="logto_failed_144_$stamp"
printf '%s\n' "$recovery_db" > "$release/recovery-database.txt"
printf '%s\n' "$failed_db" > "$release/preserved-failed-database.txt"
sudo -u postgres createdb -O logto "$recovery_db"
sudo -u postgres pg_restore --exit-on-error -d "$recovery_db" < "$release/final.dump" > "$release/recovery-restore.log" 2>&1
sudo -u postgres psql -X -d "$recovery_db" < "$script_dir/invariants.sql" > "$release/recovery-before-swap.txt"
python3 "$script_dir/compare-invariants.py" "$release/final-before.txt" "$release/recovery-before-swap.txt" > "$release/recovery-compare.log"
# Both database renames share one transaction; keep the failed database for diagnosis.
# PostgreSQL RENAME DATABASE is transactional; neither database is the current connection.
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres > "$release/recovery-swap.log" 2>&1 <<SQL
begin;
alter database logto rename to $failed_db;
alter database $recovery_db rename to logto;
commit;
SQL
sudo -u postgres psql -X -d logto < "$script_dir/invariants.sql" > "$release/recovery-after-swap.txt"
python3 "$script_dir/compare-invariants.py" "$release/final-before.txt" "$release/recovery-after-swap.txt" > "$release/recovery-after-swap-compare.log"
install -m 600 "$release/original.env" /srv/winamz/.env
install -m 600 "$release/original-compose.yml" /srv/winamz/docker-compose.yml
printf 'services:\n  logto:\n    image: %s\n    pull_policy: never\n' "$old_id" > "$release/rollback-image.override.yml"
docker compose --project-directory /srv/winamz -p winamz --env-file /srv/winamz/.env -f /srv/winamz/docker-compose.yml -f "$release/rollback-image.override.yml" up -d --no-deps logto > "$release/recovery-compose-up.log" 2>&1
[[ $(docker inspect --format '{{.Image}}' winamz-logto) == "$old_id" ]] || { echo 'Recovered service image mismatch' >&2; exit 1; }
touch "$release/recovery-restored.passed"
printf 'Final snapshot and original image restored via Compose; failed DB retained as %s. Nginx fence and Core stop remain; verify old auth locally then run production-resume.sh before reopening ingress.\n' "$failed_db"
