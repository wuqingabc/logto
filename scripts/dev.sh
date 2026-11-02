#!/usr/bin/env bash
# winamz-logto 开发态启动入口(自愈版)
#
# 为什么需要它:logto core 启动前会校验「所有 alteration 已部署」,任何新增 alteration
# (winamz patch 或上游升级)若没先 `alteration deploy`,core 会直接崩在
# 「Undeployed database alterations found」死循环。2026-06-21 dev 机就因 winamz patch 0011
# 的自定义 alteration(M2M all-scope)从未部署而踩坑。
#
# 本脚本在启动前自动 `alteration deploy latest`(版本无关,不用写死版本号),自愈这一类问题。
# 用法:bash scripts/dev.sh   (替代直接 `cd logto && pnpm dev`)
# 详见 winamz-core/docs/claude/local-dev-startup.md §1。
set -uo pipefail

cd "$(dirname "$0")/../logto"
export N_PREFIX=$HOME/n PATH=$HOME/n/bin:$PATH

ENV_FILE="packages/core/.env"

echo "[winamz-logto] 1/3 构建 packages(prepack,生成 cli/lib)..."
pnpm -r prepack

echo "[winamz-logto] 2/3 自动部署 pending alteration(deploy latest,版本无关)..."
if [ -f "$ENV_FILE" ]; then
  node packages/cli/lib/index.js db alteration deploy latest --env "$ENV_FILE" \
    || echo "[winamz-logto] ⚠ alteration deploy 失败/跳过,继续启动(core 预检会再次把关)"
else
  echo "[winamz-logto] ⚠ 未找到 $ENV_FILE,跳过自动部署"
fi

echo "[winamz-logto] 3/3 启动 logto(start:dev,core 4000 / admin 4001)..."
exec pnpm start:dev
