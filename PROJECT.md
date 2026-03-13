# WinAMZ Logto — 项目简介

> 基于 Logto OSS Fork 的 WinAMZ 身份认证与 AI Agent 授权平台

---

## 项目概述

**winamz-logto** 是对开源身份认证框架 [Logto](https://logto.io) 的定制化 Fork，专注于企业 AI Agent 身份注册、委托授权与安全治理，满足 WinAMZ 业务系统的两种 AI Agent 授权模型：

### 两种授权模型

| 模型 | 场景 | Token 特征 |
|------|------|-----------|
| **个人 Agent（OpenClaw 模式）** | AI 助手以员工身份代替员工操作 ERP/CRM 等 | `act.sub = agentId`（RFC 8693 Actor Token） |
| **企业 Agent（Org Agent 模式）** | 企业级 AI 代表企业整体执行任务 | M2M Token + `org_id`，需管理员审批 |

### WinAMZ 定制功能（在 Logto 基础上新增）

- AI Agent 注册表（`winamz_agents` 数据库表）
- 个人 Agent 委托流程（用户同意 + Actor Token 生成）
- 企业 Agent 生命周期管理（申请 → 审批 → 激活 → 挂起）
- Kill Switch：一键撤销 Agent 所有委托权限
- Admin Console 扩展：AI Agents 管理侧边栏
- 多语言支持（含中文 i18n）

---

## 技术栈

| 层次 | 技术 |
|------|------|
| **运行时** | Node.js ^22.14.0 |
| **包管理** | pnpm ^9.0.0 / ^10.0.0 |
| **语言** | TypeScript（全栈） |
| **核心框架** | Koa.js（后端 API）|
| **前端框架** | React + Vite |
| **数据库** | PostgreSQL 17 |
| **认证协议** | OIDC / OAuth 2.1 / SAML / RFC 8693 |
| **构建工具** | tsup、Vite、pnpm workspaces（Monorepo） |
| **容器化** | Docker / Docker Compose |
| **版本管理** | Changesets |

---

## 目录结构

```
winamz-logto/
├── packages/
│   ├── core/          # 后端核心服务（Koa, OIDC Provider）- 主应用入口
│   ├── console/       # 管理控制台前端（React + Vite）
│   ├── experience/    # 用户登录/注册体验页面（React + Vite）
│   ├── account/       # 账户自助服务页面
│   ├── api/           # API 类型定义与 SDK
│   ├── schemas/       # 数据库 Schema 与 Zod 验证
│   ├── connectors/    # 第三方 IdP 连接器（Google、GitHub、企业 SSO 等）
│   ├── phrases/       # i18n 翻译文件
│   ├── cli/           # Logto CLI 工具
│   ├── toolkit/       # 共享工具库
│   ├── elements/      # 共享 UI 组件库
│   ├── shared/        # 后端共享模块
│   ├── demo-app/      # 演示应用
│   └── integration-tests/ # 集成测试
├── docs/
│   ├── prd.md         # WinAMZ 产品需求文档
│   └── integration/   # 接入指南（总览、快速入门、个人/企业 Agent 配置）
├── docker-compose.yml  # 本地 Docker 部署配置
├── Dockerfile          # 生产镜像构建文件
└── .github/workflows/  # CI/CD 流水线
```

---

## 运行方式

### 方式一：Docker Compose（推荐，最简单）

```bash
docker compose -p logto up
```

- 端口 `3001`：Logto 核心 API + OIDC 端点
- 端口 `3002`：管理控制台（Console UI）
- 依赖 PostgreSQL 17（自动启动）

### 方式二：本地开发

**前提：** Node.js 22+、pnpm 9+、PostgreSQL 17+

```bash
# 安装依赖
pnpm install

# 初始化数据库
pnpm cli db seed

# 启动开发模式（热重载）
pnpm dev
```

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `DB_URL` | PostgreSQL 连接串 | `postgres://user:pass@localhost:5432/logto` |
| `ENDPOINT` | Logto 对外服务地址 | `https://auth.winamz.com` |
| `ADMIN_ENDPOINT` | 管理控制台地址 | `https://admin.winamz.com` |
| `TRUST_PROXY_HEADER` | 是否信任代理 Header | `1` |

---

## 版本信息

- **当前版本：** 1.37.1（基于 Logto OSS）
- **上游仓库：** https://github.com/logto-io/logto
- **Fork 仓库：** https://gitee.com/wuqingabc_admin/winamz-logto
- **许可证：** MPL-2.0

---

## 相关文档

- [产品需求文档](./docs/prd.md)
- [接入总览](./docs/integration/overview.md)
- [快速接入指南](./docs/integration/quickstart.md)
- [个人 Agent 接入](./docs/integration/personal-agent.md)
- [企业 Agent 接入](./docs/integration/org-agent.md)
- [升级指南](./docs/upgrade-guide.md)
