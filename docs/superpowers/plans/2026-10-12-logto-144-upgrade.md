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

- [ ] 1. Inventory production versions, DB alteration history, client/callback configurations and custom patches; save old image/config metadata and baseline auth health.
- [ ] 2. Run standard patch-rebase onto official1.44.0; resolve conflicts preserving new upstream logic, archive old patches, export replayable active patches and pin pristine official gitlink.
- [ ] 3. Add failing security/session tests; adapt silent-grant validation/session API and run focused tests against actual new dependency runtime.
- [ ] 4. Adapt custom agent APIs/console/schema alterations for upstream types and user-ID expansion; verify agent/grant authorization and build all matching assets.
- [ ] 5. Commit/push Gitee and build versioned Linux image from frozen dependencies; verify source labels and import image to production host.
- [ ] 6. Restore production DB into isolated staging, deploy all alterations, verify schema/history/identity invariants and native OIDC/SSO/management routes against the final image.
- [ ] 7. Pause writers, take fresh DB/config backup, deploy proven alterations and matching image, restart writers after Logto health checks.
- [ ] 8. Run public OIDC/login/refresh/logout, Core/Connect integration and tenant isolation acceptance; remove temporary fixtures and record backup/recovery evidence.

## Verification commands and files

- Source workflow: `bash scripts/patch-rebase.sh v1.44.0`, then `bash scripts/patch-apply.sh` from clean official pin.
- Build workflow: `WINAMZ_BUILD_N=0 bash scripts/build-image.sh`; Dockerfile must use the official supported toolchain, frozen lockfile and source revision labels.
- CLI alterations: final-image `pnpm cli db alteration deploy` against isolated DB first; use the CLI's actual options after inspecting its help. Record pending/history and database identity/FK invariants.
- Auth tests own `packages/core/src/routes/winamz/silent-grant*`; independent agent compatibility owns other custom WinAMZ routes/console/schema files. Root owns wrapper scripts/Dockerfile/series and deployment fixtures.
- Runtime smoke scripts must avoid console printing credentials, persist restricted fixture inputs, assert real redirects/cookies/token responses and clean their own identities only.
