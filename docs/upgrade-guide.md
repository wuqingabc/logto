# Logto 上游升级指南

## 最小耦合原则

WinAMZ 对 Logto 源码的所有改动分为两类，确保升级时风险可控：

### A 类：纯新增文件（升级无冲突）

这些文件在 Logto 原始代码库中不存在，升级时不会产生任何冲突：

```
packages/core/src/routes/winamz/                   ← 新目录，WinAMZ 路由
packages/console/src/pages/winamz/                 ← 新目录，WinAMZ 管理页面
packages/console/src/pages/winamz/components/      ← 新目录，WinAMZ 组件
packages/console/src/hooks/use-console-routes/routes/winamz.tsx  ← 新文件
packages/schemas/src/winamz.ts                     ← 新文件，TypeScript 类型定义
packages/schemas/src/migrations/winamz-001-create-tables.ts      ← 新文件，DB 建表
packages/schemas/src/migrations/winamz-002-add-fk-constraints.ts ← 新文件，外键约束
packages/phrases/src/locales/en/translation/admin-console/winamz.ts ← 新文件，i18n 字符串
docs/                                              ← 新目录，项目文档
```

### B 类：对现有文件的微量改动（通过 cherry-pick 管理）

这些改动量极小（每处 1–8 行），且均标注 `[winamz]` 注释，便于合并冲突时快速定位：

| 文件 | 改动内容 | 行数 |
|------|----------|------|
| `packages/core/src/routes/init.ts` | 挂载 winamz 路由 | +3 |
| `packages/console/src/hooks/use-console-routes/index.tsx` | 声明 winamz 路由 | +5 |
| `packages/console/src/containers/ConsoleContent/Sidebar/hook.tsx` | 添加 AI Agents 菜单项 | +8 |
| `packages/phrases/src/locales/en/translation/admin-console/tabs.ts` | 添加 tab key | +6 |
| `packages/phrases/src/locales/en/translation/admin-console/tab-sections.ts` | 添加 section key | +1 |
| `packages/phrases/src/locales/en/translation/admin-console/index.ts` | 导入 winamz i18n | +2 |

所有 B 类改动集中在以 `[winamz]` 为前缀的独立 git commit 中，便于 cherry-pick。

---

## 升级操作流程

```bash
# ① 拉取上游 Logto 更新
git remote add upstream https://github.com/logto-io/logto.git  # 首次执行
git fetch upstream

# ② 评估 B 类文件的影响（查看上游是否修改了同一位置）
git log upstream/master --oneline -20
git diff HEAD upstream/master -- packages/core/src/routes/init.ts
git diff HEAD upstream/master -- packages/console/src/hooks/use-console-routes/index.tsx
git diff HEAD upstream/master -- packages/console/src/containers/ConsoleContent/Sidebar/hook.tsx
git diff HEAD upstream/master -- packages/phrases/src/locales/en/translation/admin-console/tabs.ts

# ③ 无冲突时：直接 rebase
git rebase upstream/master

# ④ 有冲突时：手动解决后继续
# （搜索 [winamz] 注释可快速定位 WinAMZ 添加的内容）
git rebase --continue

# ⑤ 执行 Logto 新版本的数据库迁移（WinAMZ 的迁移文件不受影响）
pnpm -r build
node packages/cli/bin/logto.js database alteration deploy latest

# ⑥ 验证所有服务正常
curl http://localhost:4001/api/status            # Logto 核心正常
curl http://localhost:4001/api/winamz/agents     # WinAMZ 路由正常
```

---

## B 类 Commit 格式规范

所有修改 Logto 现有文件的 commit 使用以下格式，便于 cherry-pick 和审查：

```
[winamz] <改动描述>

Modified files:
- packages/core/src/routes/init.ts: 挂载 winamz 路由
- packages/console/src/hooks/use-console-routes/index.tsx: 添加 winamz 路由声明
```

在上游 rebase 后，cherry-pick 所有 winamz commits：
```bash
# 列出所有 [winamz] commits（按时间正序）
git log --oneline --grep="^\[winamz\]" origin/master | awk '{print $1}' | tac

# 批量 cherry-pick（在 rebase 后的新 HEAD 上执行）
git log --oneline --grep="^\[winamz\]" origin/master | awk '{print $1}' | tac | xargs git cherry-pick
```

---

## phrases 包重新编译

每次修改 `packages/phrases/src/` 下的文件后，必须重新编译，否则 Admin Console 不会加载新的 i18n key：

```bash
cd packages/phrases
pnpm build   # 执行 rm -rf lib/ && tsc
```

> **原因**：Console dev server（Vite）从 `packages/phrases/lib/` 引用编译产物，而非 TypeScript 源文件。

---

## 版本兼容记录

| WinAMZ 版本 | 基于 Logto 版本 | B 类冲突文件 | 处理方式 |
|-------------|-----------------|-------------|----------|
| v0.1 | v1.26.0 | 无 | — |

---

## 新增 WinAMZ DB 迁移后的注意事项

WinAMZ 迁移文件**不通过** Logto 的 `alteration` 系统管理，需手动执行：

```bash
# 查看迁移文件内容并执行
psql $DATABASE_URL <<'SQL'
  -- 来自 winamz-001-create-tables.ts
  CREATE TABLE IF NOT EXISTS winamz_agents ( ... );
  CREATE TABLE IF NOT EXISTS winamz_agent_grants ( ... );
  CREATE TABLE IF NOT EXISTS winamz_audit_logs ( ... );
SQL

# 外键约束（需先确认 organizations 和 users 表存在）
psql $DATABASE_URL <<'SQL'
  -- 来自 winamz-002-add-fk-constraints.ts
  ALTER TABLE winamz_agents
    ADD CONSTRAINT fk_winamz_agents_org
      FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ALTER TABLE winamz_agents
    ADD CONSTRAINT fk_winamz_agents_owner
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
SQL
```
