# winamz-logto

Logto OIDC 服务的 WinAMZ 部署 wrapper（Patch Stack 模式）。

## Quick start

```bash
# 1. 初始化 logto submodule + checkout pin
bash scripts/patch-init.sh

# 2. 应用 patches + 构建镜像
WINAMZ_BUILD_N=3 bash scripts/build-image.sh

# 3. 启动
docker compose up -d
```

当前版本：官方 Logto **v1.44.0**，WinAMZ 镜像 **v1.44.0-winamz.3**，使用 Node 22 和官方冻结依赖锁。

旧生产库存在自定义迁移时间戳覆盖官方迁移的历史问题。升级前必须完成数据库副本演练，执行 [迁移与恢复流程](scripts/upgrade144/README.md)，不能直接启动新镜像。

桌面静默 SSO 需要配置 `WINAMZ_SILENT_GRANT_CLIENT_IDS`、`WINAMZ_SILENT_GRANT_AUDIENCES` 和 `WINAMZ_SILENT_GRANT_ORIGINS`。它复用原登录会话；旧令牌需刷新或重新登录。

详见 [CLAUDE.md](./CLAUDE.md) 和 [winamz-core ADR-013](../winamz-core/docs/adr/013-open-source-patch-stack.md)。
