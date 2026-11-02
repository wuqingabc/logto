#!/usr/bin/env bash
# PREPARED ONLY. This is the explicit end of the zero-loss recovery window.
set -euo pipefail
umask 077
[[ -x /ewomail/nginx/sbin/nginx ]] || { echo 'Expected production nginx binary missing' >&2; exit 1; }
release=${1:?Usage: production-resume.sh FINAL_RELEASE_DIR}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
[[ $(id -u) == 0 && "$release" == /srv/winamz/backups/logto144-*/final-* ]] || exit 1
[[ -f "$release/local-auth-gates.passed" ]] || { echo 'Complete local TLS issuer/JWKS/login/refresh checks before reopening public ingress' >&2; exit 1; }
[[ -f "$release/migration-gates.passed" || -f "$release/recovery-restored.passed" ]] || exit 1
python3 "$script_dir/production-fence.py" verify "$release"
# Write this BEFORE any ingress/writer resumes, including if later commands fail.
touch "$release/writers-resumed"
python3 "$script_dir/production-fence.py" restore "$release"
/ewomail/nginx/sbin/nginx -t > "$release/nginx-resume-test.log" 2>&1
/ewomail/nginx/sbin/nginx -s reload
if [[ $(cat "$release/original-core-running.txt") == true ]]; then
  docker compose --project-directory /srv/winamz -p winamz --env-file /srv/winamz/.env -f /srv/winamz/docker-compose.yml up -d --no-deps winamz-core > "$release/core-resume.log" 2>&1
fi
echo 'Public ingress/Core resumed; exact pre-upgrade restore now requires write reconciliation.'
