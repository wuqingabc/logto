#!/usr/bin/env bash
# Run on database host as root. Never alters production data or stops containers.
set -euo pipefail
umask 077
backup_dir=${1:-/srv/winamz/backups/logto144-20261012}
[[ "$backup_dir" == /srv/winamz/backups/logto144-* ]] || { echo 'Unexpected backup directory' >&2; exit 1; }
[[ $(id -u) == 0 ]] || { echo 'Run as root on database host' >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
install -d -m 700 "$backup_dir"
[[ ! -e "$backup_dir/preliminary.dump" ]] || { echo 'Refusing to overwrite existing backup' >&2; exit 1; }
[[ $(sudo -u postgres psql -X -Atc "select count(*) from pg_database where datname='logto_upgrade_144'") == 0 ]] || { echo 'Clone already exists' >&2; exit 1; }
sudo -u postgres psql -X -d logto < "$script_dir/invariants.sql" > "$backup_dir/production-before.txt"
sudo -u postgres pg_dump -Fc -d logto > "$backup_dir/preliminary.dump"
sudo -u postgres pg_restore --list < "$backup_dir/preliminary.dump" > "$backup_dir/preliminary.list"
sudo -u postgres createdb -O logto logto_upgrade_144
sudo -u postgres pg_restore --exit-on-error -d logto_upgrade_144 < "$backup_dir/preliminary.dump"
sudo -u postgres psql -X -d logto_upgrade_144 < "$script_dir/initialize-clone-roles.sql" > "$backup_dir/clone-roles-init.log" 2>&1
sudo -u postgres psql -X -d logto_upgrade_144 < "$script_dir/invariants.sql" > "$backup_dir/clone-before.txt"
sha256sum "$backup_dir/preliminary.dump" > "$backup_dir/preliminary.dump.sha256"
echo "Clone restored; private evidence in $backup_dir. Preliminary snapshot is not a downtime rollback backup."
