#!/usr/bin/env bash
# 仓库特定变量（每仓库定制；其他 patch-*.sh source 此文件）
# 详见 winamz-core/docs/adr/013-open-source-patch-stack.md

export UPSTREAM_REPO="https://github.com/logto-io/logto"
export UPSTREAM_DIR="logto"
# 官方稳定版本；gitlink 指向原始版本，WinAMZ 定制由 patches/series 重放。
export UPSTREAM_VERSION="v1.44.0"
export IMAGE_NAME="logto"
export DOCKERFILE="docker/Dockerfile.winamz"
