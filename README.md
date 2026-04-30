# winamz-logto

Logto OIDC 服务的 WinAMZ 部署 wrapper（Patch Stack 模式）。

## Quick start

```bash
# 1. 初始化 logto submodule + checkout pin
bash scripts/patch-init.sh

# 2. 应用 patches + 构建镜像
WINAMZ_BUILD_N=0 bash scripts/build-image.sh

# 3. 启动
docker compose up -d
```

详见 [CLAUDE.md](./CLAUDE.md) 和 [winamz-core ADR-013](../winamz-core/docs/adr/013-open-source-patch-stack.md)。
