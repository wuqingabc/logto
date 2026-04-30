# winamz-logto

Logto OIDC 服务部署 + 我方扩展（**Patch Stack 模式**，详见 [winamz-core/docs/adr/013-open-source-patch-stack.md](../winamz-core/docs/adr/013-open-source-patch-stack.md)）。

---

## 架构原则

仓库结构 = wrapper + upstream submodule + patches：

- `logto/` — git submodule，pin 到 commit `69d3eb6bd`（v1.37.1 + 29 commits 的状态），**禁止**直接修改并 commit 到本仓库
- `patches/` — 我方对 logto 源码的**所有**修改（4 个 patch，AI Agent 授权平台相关）
- `docker/Dockerfile.winamz` — 我方镜像构建文件
- `scripts/patch-*.sh` — 标准工作流（与 winamz-chatwoot / 其他 patch stack 仓库**完全一致**）
- 镜像 tag：`winamz/logto:{upstream-version}-winamz.{N}`

**当前 pin 注解**：`UPSTREAM_VERSION=69d3eb6bdaa6dd18c313da8a94487da294c1d9d4` 是 commit hash（不是 tag）。这是迁移时的初始 pin（与抽 patch 时的 merge base 对齐）。后续升级到 tagged release（如 `v1.37.1`、`v1.38.0`）走 `patch-rebase.sh`。

---

## 改动优先级铁律（强制）

引入新改动时**必须**按优先级评估，越往下越重：

1. **ENV 变量** —— 能用 env 控制行为绝不写代码
2. **`overlays/`**（如适用）—— logto 没有 Rails initializer 模式，多数情况下走不通
3. **`patches/`** —— 实际上 logto 大部分扩展只能走 patch（比 chatwoot 路径少）

---

## 当前 patches 清单（9 个）

| 序号 | 内容 |
|-----|------|
| 0001 | A-class：新增 AI Agent 授权平台核心代码（新文件） |
| 0002 | B-class：挂载路由 + 控制台侧边栏新增 AI Agents 入口 |
| 0003 | 集成测试发现的运行时错误修复 |
| 0004 | AgentDetails 详情页 + i18n（含中文）+ FK migration |
| 0005 | docs：PROJECT.md + pnpm-lock hash format |
| 0006 | docs：WinAMZ 专用配置（端口 4000/4001 + 启动步骤 + Admin Console） |
| 0007 | chore：rename alteration file next → 1.37.1 |
| 0008 | ci：GitHub Actions CI pipeline |
| 0009 | chore：忽略 build/ Docker 产物 |

完整文件名见 `patches/series`。

---

## 工作流速查

### 加新 patch
```bash
cd logto/
# 直接改源码
cd ..
bash scripts/patch-add.sh "feat: short description"

# bump 镜像 tag + 重构
WINAMZ_BUILD_N=1 bash scripts/build-image.sh
# 改 docker-compose.yml 的 image tag → commit
```

### 升级 logto 版本
```bash
# 例：升到 v1.37.1
bash scripts/patch-rebase.sh v1.37.1
# 冲突时按提示手工解决

# 改 scripts/env.sh 的 UPSTREAM_VERSION
WINAMZ_BUILD_N=0 bash scripts/build-image.sh
```

### 首次部署
```bash
bash scripts/patch-init.sh
WINAMZ_BUILD_N=0 bash scripts/build-image.sh
docker compose up -d
```

---

## 历史与备份

- **archive/pre-patch-stack** 分支保留迁移前的旧 fork 完整历史（`e126ae233 → e0d3e2d1b`，4 个 [winamz] commit + 全部 logto 上游历史）
- 迁移时验证：`logto/` submodule HEAD 应用全部 patches 后的 tree hash = `616228675d6ea072051b0beccc54786a594b570e`，与 `archive/pre-patch-stack` HEAD tree hash 完全一致（**字节级相同**）

---

## 禁止事项

- ❌ 不要直接 `cd logto/ && git commit` 然后在本仓库 commit submodule pointer 推走 —— 必须导出为 `patches/NNNN-*.patch`
- ❌ 不要跳过 `patch-rebase.sh` 升级 logto —— 必须走标准流程
- ❌ 不要 force-push 删除 `archive/pre-patch-stack` 分支 —— 这是回退路径
- ❌ 不要忘记 bump `WINAMZ_BUILD_N`（每次 patch 变更）/ reset 为 0（每次升级 upstream）
- ❌ 不要在 `patches/` 里放 logto 内部的 pnpm dep patches（如 logto 自己的 `tsup.patch`）—— 那些是 logto 上游 artifact，由 logto 自己管理

---

## 目录

```
docker-compose.yml              ← 引用 winamz/logto:{tag} 自构建镜像
logto/                          ← submodule pinned to 69d3eb6bd
patches/
  series                        ← 排序的 patch 文件名
  0001-*.patch（4 个）
docker/
  Dockerfile.winamz             ← 我方镜像构建文件（multi-stage build）
scripts/
  env.sh                        ← UPSTREAM_REPO/DIR/VERSION/IMAGE_NAME/DOCKERFILE 变量
  patch-init.sh                 ← submodule 初始化
  patch-apply.sh                ← apply 所有 patches
  patch-add.sh                  ← 导出新 patch
  patch-rebase.sh               ← 升级上游 + 批量 rebase
  patch-reset.sh                ← reset logto/ 到干净 pin
  build-image.sh                ← apply + docker build
```
