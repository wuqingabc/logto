# Logto Upstream Upgrade Guide

## Minimum Coupling Principle

All modifications to Logto source code fall into two categories:

### Class A: Pure new files (zero conflict on upgrade)

```
packages/core/src/routes/winamz/          ← New directory
packages/console/src/pages/winamz/        ← New directory
packages/schemas/src/winamz.ts            ← New file
packages/schemas/src/migrations/winamz-*  ← New migration files
docs/                                     ← New directory
```

### Class B: Micro-changes to existing files (managed via cherry-pick)

```
packages/core/src/routes/init.ts                            → +3 lines (mount winamz routes)
packages/console/src/hooks/use-console-routes/index.tsx     → +5 lines (add route declarations)
packages/console/src/containers/ConsoleContent/Sidebar/hook.tsx → +8 lines (add AI Agents menu)
packages/phrases/src/locales/en/translation/admin-console/tabs.ts → +3 lines (add tab keys)
packages/phrases/src/locales/en/translation/admin-console/tab-sections.ts → +1 line (add section key)
```

Class B changes are concentrated in dedicated git commits with `[winamz]` prefix, facilitating cherry-pick.

---

## Upgrade Procedure

```bash
# 1. Pull upstream Logto updates
git fetch upstream

# 2. Check upstream changes (assess impact on Class B files)
git log upstream/master --oneline -20
git diff HEAD upstream/master -- packages/core/src/routes/init.ts
git diff HEAD upstream/master -- packages/console/src/hooks/use-console-routes/index.tsx
git diff HEAD upstream/master -- packages/console/src/containers/ConsoleContent/Sidebar/hook.tsx
git diff HEAD upstream/master -- packages/phrases/src/locales/en/translation/admin-console/tabs.ts

# 3. If no conflicts in Class B files, rebase directly
git rebase upstream/master

# 4. If Class B files have conflicts, resolve manually and continue
git rebase --continue

# 5. Run DB migrations (new Logto version may have new migrations)
pnpm -r build
node packages/cli/bin/logto.js database alteration deploy latest

# 6. Verify
curl http://localhost:4001/api/status          # Logto core normal
curl http://localhost:4001/api/winamz/agents   # WinAMZ routes normal
```

---

## Version Compatibility Record

| WinAMZ Version | Based on Logto Version | Class B Conflict Files | Resolution |
|----------------|------------------------|------------------------|------------|
| v0.1           | v1.26.0                | None                   | -          |

---

## Class B Commit Format

All commits modifying Logto existing files use this format:
```
[winamz] <description>

Files modified:
- packages/core/src/routes/init.ts: mount winamz routes
- ...
```

To cherry-pick all winamz commits after upstream rebase:
```bash
git log --oneline --grep="^\[winamz\]" origin/master | awk '{print $1}' | tac | xargs git cherry-pick
```
