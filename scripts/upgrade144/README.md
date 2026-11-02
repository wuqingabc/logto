# Logto 1.44 migration gates (2026-10-12)

These scripts run on the PostgreSQL host as root. They never start the upgraded service or stop production. `rehearse-clone.sh` can only alter `logto_upgrade_144`.

## Historical timestamp collision

Production `systems.alterationState.timestamp` is **1781448279**, from the custom 1.37.1 management API seed. Stock CLI filters strictly by numeric timestamp, not release version or historical filename. It would skip 16 newly introduced upstream migrations after the already applied **1772615848** grant index and before the custom seed.

The official diff from old upstream pin `69d3eb6bdaa6dd18c313da8a94487da294c1d9d4` to `v1.44.0` proves every alteration at/below 1772615848 is unchanged, except the identical grant index file renamed from `next` to `1.38.0`. No new timestamp below this boundary exists. All later upstream alterations are new. Existing partial grant index is valid and ready; legacy grant index remains. The gap's new columns/tables/indexes are absent, and autovacuum options remain unset. `rewind-verified-boundary.sql` asserts these conditions before changing the watermark in one transaction.

CLI actual syntax: `node packages/cli/bin/logto.js database alteration deploy 1.44.0`. `list` lists all scripts, not just pending scripts. Each alteration body and watermark update share a transaction; concurrent index `beforeUp`/`beforeDown` hooks execute outside it. Never blindly retry after a failed concurrent build: inspect `pg_index.indisvalid` and the watermark first.

## Current private evidence

`/srv/winamz/backups/logto144-20261012/` mode0700 contains preliminary custom-format dump, SHA256, TOC, production/clone baselines, and mode0600 production/clone environment files. Clone restore completed successfully. This is a live preliminary snapshot, not the final recovery point.

Baseline: 4 users, 11 applications, 2 tenants, no social/SSO connectors. Stable user credentials/MFA/IDs, app secrets/metadata/callbacks, signing configuration, roles and resources are represented by counts and digests only. Existing management API resources missing `all` scope: 3. Seed replay is expected to add these scopes and possibly role associations.

App metadata includes 6 custom scheme URLs, 13 private/special destinations, 2 public destinations; no connector, SSO or hook URL is configured. Desktop/browser callback URLs are not themselves server outbound requests. Upstream SSRF protection affects server fetches to connector metadata/token/userinfo/JWKS, hooks and other operator URLs. Relevant opt-ins/overrides: `SSRF_ALLOWED_ADDRESSES`, `SSRF_PROTECTION_DISABLED`, legacy `OIDC_PROVIDER_SSRF_PROTECTION_DISABLED`; none is configured in the production container. Preserve protection, and verify actual flows after startup.

## Rehearsal

Stage this directory together on the host; use the exact candidate image digest:

```sh
bash rehearse-clone.sh IMAGE
```

`prepare-clone.sh` restores data and initializes independent clone roles using
`initialize-clone-roles.sql`: NOLOGIN/NOINHERIT base, LOGIN/INHERIT tenant members,
private replacement tenant passwords, standard upstream grants/exclusions, and
clone-only RLS policy role mapping. It never grants clone membership to production
roles. A dump contains database objects but not cluster roles; without this setup,
new-table migrations fail at the RLS grant. `finalize-clone-permissions.sql` maps
canonical WinAMZ custom-table grants to the clone base after migration. A fresh
final-backup restore proof that only reads invariants needs neither role setup nor
new CLI execution; independent role setup is needed to run an isolated app/CLI.

Run once against the restored original clone. On failure retain logs and inspect state. To repeat a clean rehearsal, explicitly recreate the isolated clone from the preliminary dump; the wrapper intentionally refuses a second rewind at a different watermark. Logs remain private because CLI errors could include SQL/config details.

Success gates: unchanged stable identities/configuration digests; all required gap columns present; no invalid indexes or unvalidated constraints; zero missing management API `all` scopes; final custom watermark at least1789000001; every actual user-ID foreign key and
all five custom user-reference columns width128. Organization/custom table data,
pre-existing scopes/role links, and all unexpired OIDC payload/metadata must survive.
Only missing Management API all scopes and their standard management-role links may
be added. New nullable CIMD session column and organization trusted-device default
are checked separately from legacy row digests. Capture clone-before after the old
SSO fixture stage has stopped; preserve the original four-user baseline separately.

## Production release and recovery gates

1. Candidate image must pass the clone rehearsal and relevant unit/build checks. Record immutable old/candidate image IDs and original container configuration privately.
2. Pause Logto writers, including app, workers, management clients and schedulers; confirm no remaining DB writer sessions. Core/Chatwoot need not be stopped unless they continue identity writes. Take a **new final custom-format dump** of `logto`, checksum it, inspect its TOC, and restore it to a fresh verification database. Capture final invariants from the same paused state. Never use the older live preliminary dump as a zero-loss rollback claim.
3. With writers paused, run the guarded rewind SQL with `expected_database=logto`, then the candidate's explicit CLI `database alteration deploy 1.44.0` using private production env. Compare against final invariants and run schema gates before starting candidate app.
4. Start candidate and verify health, discovery/JWKS, management client credentials, browser/desktop redirects, silent grant/custom routes and existing session refresh. Compare issuer/audience/callback behavior. Restore writers only after these gates pass.
5. Any migration/schema/identity failure keeps writers paused. Preserve failed database/logs for inspection. Restore the **final paused dump into a separate replacement database**, verify baseline invariants and old-app compatibility, then point the original image/container configuration at that restored database (or recreate `logto` from final dump under an explicit recovery operation). Start original image and smoke test before resuming writers. Do not start the old image against the partially migrated database without proof of compatibility, and do not run stock rollback as a substitute for exact data restoration.
6. Once upgraded writes are allowed, restoring a pre-upgrade dump loses those writes. A later rollback requires an explicit reconciliation decision; do not silently restore the earlier snapshot.

### Prepared production commands

The final candidate is `winamz/logto:v1.44.0-winamz.3`, image
`sha256:24686c37151fc6700f5d2726158480060148e662eac0ea68812a1fc61509b44b`.
Its build includes the real CLI alteration-copy/import regression gate. All thirteen
patches replay from the pristine official pin to the reviewed source tree.

Stage this whole script directory together. `production-upgrade.sh` requires an
immutable image approval file from successful clone migration and SSO acceptance.
It installs temporary auth/console nginx fences permitting only localhost, stops
Core and Logto, and leaves both stopped after migration. Mailsac preserves incoming
mail; Chatwoot stays running and deferred forwarding catches up after Core resumes.
Existing production environment backup remains untouched; only the
private `production-migration.env` uses the verified database listener `172.17.0.1`.

```sh
bash production-upgrade.sh winamz/logto:v1.44.0-winamz.3
release=$(cat /srv/winamz/backups/logto144-20261012/production-release-active.txt)
bash activate-production.sh
python3 verify-production.py "$release"
bash production-resume.sh "$release"
```

Activation starts only the matching Logto image under the ingress fence. Local
acceptance uses TLS with the real issuer, requires unchanged public signing keys,
checks Core's actual M2M credentials and Management/WinAMZ API reads, rejects
anonymous/M2M silent grants, and checks desktop CORS. Legacy user refresh, cookie,
authentication context, separate-app SSO, logout and fresh login are verified on
the migrated production clone first. Resume writes `writers-resumed` before any
public ingress or Core writer returns. Verify public discovery, Core health and
mail worker status after resuming.

On failure before resume, `production-rollback.sh "$release"` restores the proven
final dump and original image/config while retaining the failed database and
ingress fence. Verify the restored old service locally before reopening ingress;
the upgraded-only smoke script must not be used as an old-version acceptance gate.
