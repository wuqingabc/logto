#!/usr/bin/env bash
# 仓库特定变量（每仓库定制；其他 patch-*.sh source 此文件）
# 详见 winamz-core/docs/adr/013-open-source-patch-stack.md

export UPSTREAM_REPO="https://github.com/logto-io/logto"
export UPSTREAM_DIR="logto"
# 当前 pin 到 merge base commit（v1.37.1 之后 29 个 upstream commit）。
# 升级到 tagged release（如 v1.37.1）时调 patch-rebase.sh，可能需手工 conflict resolution。
export UPSTREAM_VERSION="69d3eb6bdaa6dd18c313da8a94487da294c1d9d4"
export IMAGE_NAME="logto"
export DOCKERFILE="docker/Dockerfile.winamz"
