# Logto 1.44.0 upgrade implementation plan

> Execute continuously with executing-plans. Independent authentication and agent compatibility tasks use dispatching-parallel-agents; root owns build, database rehearsal and rollout.

**Goal:** Upgrade production Logto1.37.1 to official1.44.0, preserving WinAMZ identity IDs, organizations, application clients, existing grants and enterprise login/SSO.
**Architecture:** Wrapper + pristine official upstream pin + replayable patches; full matching console/experience/core Linux image. Rehearse alterations on an isolated production database copy before stopped-writer backup and production deployment.
**Tech stack:** Official Logto1.44.0 Node/pnpm runtime, oidc-provider9/Koa3, existing native PostgreSQL18.
**Spec:** User approved the recommended security/SSO-compatible upgrade and deployment.

## Constraints and rulings

- Original checkout contains untracked browser artifacts/dev script; preserve it, work in isolated upgrade/logto-1.44.0.
- User authorization covers fixes, Gitee push, production backup/migration/deployment. Do not ask again.
- Production secrets/tokens/SSO URLs never appear in logs; credentials and smoke fixtures use restricted files.
- Existing production identity IDs, signing keys and client secrets must remain stable.
- Keep Mailsac receipt active. Pause Logto/Core application writers for final consistent backup and migration; restore writers after health checks.
- ToolSearch/Ruflo tools are not exposed this session; use available tools. CodeGraph indexes Core rather than this wrapper; use known patch paths and literal searches here.
- Restore DB together with matching old image/config on rollback; do not downgrade image across schema changes alone.

## Review focus

1. Silent SSO accepts valid user access tokens only, rejects ID/M2M/expired/wrong issuer/audience/client tokens and suspended users.
2. OIDC provider9 session/cookie behavior supports browser prompt=none and preserves MFA/security policy.
3. Management API scopes, agent/grant endpoints and tenant isolation remain valid under Koa3.
4. All user-ID references, including custom agent/grant tables, tolerate the upstream128-character limit.
5. Public enterprise login, token refresh, logout and existing app clients work after migration; private callback compatibility is verified without disabling SSRF protection globally.

## Tasks

- [x] 1. Inventory production versions, DB alteration history, client/callback configurations and custom patches; save old image/config metadata and baseline auth health.
- [x] 2. Run standard patch-rebase onto official1.44.0; resolve conflicts preserving new upstream logic, archive old patches, export replayable active patches and pin pristine official gitlink.
- [x] 3. Add failing security/session tests; adapt silent-grant validation/session API and run focused tests against actual new dependency runtime.
- [x] 4. Adapt custom agent APIs/console/schema alterations for upstream types and user-ID expansion; verify agent/grant authorization and build all matching assets.
- [x] 5. Commit/push Gitee and build versioned Linux image from frozen dependencies; verify source labels and import image to production host.
- [x] 6. Restore production DB into isolated staging, deploy all alterations, verify schema/history/identity invariants and native OIDC/SSO/management routes against the final image.
- [x] 7. Pause writers, take fresh DB/config backup, deploy proven alterations and matching image, restart writers after Logto health checks.
- [x] 8. Run public OIDC/login/refresh/logout, Core/Connect integration and tenant isolation acceptance; remove temporary fixtures and record backup/recovery evidence.

## Verification commands and files

- Source workflow: `bash scripts/patch-rebase.sh v1.44.0`, then `bash scripts/patch-apply.sh` from clean official pin.
- Build workflow: `WINAMZ_BUILD_N=0 bash scripts/build-image.sh`; Dockerfile must use the official supported toolchain, frozen lockfile and source revision labels.
- CLI alterations: final-image `node packages/cli/bin/logto.js database alteration deploy 1.44.0` against isolated DB first; use the CLI's actual options after inspecting its help. Record pending/history and database identity/FK invariants.
- Auth tests own `packages/core/src/routes/winamz/silent-grant*`; independent agent compatibility owns other custom WinAMZ routes/console/schema files. Root owns wrapper scripts/Dockerfile/series and deployment fixtures.
- Runtime smoke scripts must avoid console printing credentials, persist restricted fixture inputs, assert real redirects/cookies/token responses and clean their own identities only.


## Completed production release — 2026-10-12

- Source: pristine official `79e9e3b0d9f505260d09c80d8a015e56fbc0ec01` plus thirteen replayable patches; replay tree matches reviewed `d6617727b` exactly. Image build source wrapper revision `eac9cdaf0`.
- Running image: `winamz/logto:v1.44.0-winamz.3`, immutable `sha256:24686c37151fc6700f5d2726158480060148e662eac0ea68812a1fc61509b44b`, Node22.23.3. Full workspace build and actual CLI relocation/import gate passed.
- Focused verification: 21 silent-grant runtime tests, 6 tenant-boundary tests, 237 schema tests, core and console typechecks passed. Clone migration and no-pending CLI, all five custom user references width128, valid indexes/constraints, expanded identity/organization/custom-data/scope/live-session invariants passed.
- Clone native flows passed: old refresh token and signed cookie compatibility; unchanged authentication time/MFA context; fresh password/PKCE/organization refresh; valid desktop CORS and rejected ID/M2M tokens; authorized separate-client SSO from an independent cookie jar; protocol logout invalidates bridge. First client consent uses the normal official interaction API on the isolated fixture, never a production authorization bypass.
- Final stopped-writer recovery point: `/srv/winamz/backups/logto144-20261012/final-20261012T104332Z/` (private). New custom-format dump checksum, TOC and actual restoration into an independent proof database all passed before production rewind/migration.
- Production alteration watermark is1789000001. Migration and post-startup expanded invariants/schema gates both passed; original public JWKS remained identical. Actual Core M2M token, organization/user and three WinAMZ management API reads, anonymous/M2M silent-grant rejection and desktop CORS passed under the ingress fence.
- Public auth discovery/JWKS and console HTTP200, Core healthy after resume; Core recent startup has zero ERROR log lines and mail/outbox workers initialized. Chatwoot rails/sidekiq stayed running. Observed Logto memory196MiB/820MiB, Core365.6MiB/2.5GiB at acceptance (snapshot, not a load test).
- Private stage containers and clone-only test identities/secrets removed; original four clone users retained. Temporary upload keys, build APK relay and dedicated test containers removed. Public ingress/Core restored; `writers-resumed` marks the end of the exact pre-upgrade recovery window. Backups and sanitized gate summaries retained privately.
