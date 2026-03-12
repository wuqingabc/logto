# WinAMZ 文档索引

> **AI 读取说明**：本文件是所有文档的入口。请按照下方「推荐阅读顺序」依次读取文件，每个文件头部均标注了当前位置（如 `[文档 3/9]`）和前后文件链接，确保上下文连贯。

---

## 推荐阅读顺序

### 第一阶段：了解产品

```
① docs/README.md                          ← 当前文件，入口索引
② docs/prd.md                             ← 产品设计：功能模块、DB 结构、API 速览
```

### 第二阶段：Logto 标准接入（必读基础）

```
③ docs/integration/overview.md            ← 两种接入场景对比、服务端点
④ docs/integration/logto-setup.md         ← Logto 标准接入全面指南
                                              用户登录 / API 保护 / M2M / Organization
```

### 第三阶段：WinAMZ AI Agent 接入

```
⑤ docs/integration/quickstart.md          ← 接入全景图：Logto 基础 → AI Agent 叠加
⑥ docs/integration/personal-agent.md      ← 个人 Agent（员工委托）完整流程
⑦ docs/integration/org-agent.md           ← 企业 Agent（M2M）完整流程
⑧ docs/integration/kill-switch.md         ← Kill Switch：紧急撤销 API 参考
⑨ docs/integration/audit-log.md           ← 审计日志：写入与查询 API 参考
```

### 维护参考（开发者/运维）

```
  docs/upgrade-guide.md                   ← Logto 上游升级操作流程
```

---

## 文档依赖关系

```
README.md (入口)
    │
    ├─▶ prd.md
    │       └─ 产品背景、核心概念模型
    │
    └─▶ integration/
            │
            ├─▶ overview.md
            │       └─ 两种场景对比、端点速查
            │
            ├─▶ logto-setup.md          ← ⚠️ 先读此文，再读下方所有文档
            │       ├─ 前端 SDK 接入（React/Vue/Next.js）
            │       ├─ 后端 API 保护（jwtVerify 中间件）
            │       ├─ M2M 认证（Client Credentials）
            │       └─ Organization 多租户
            │
            ├─▶ quickstart.md           ← 两阶段接入路线图 + 代码清单
            │       ├─ 依赖：logto-setup.md（阶段一）
            │       └─ 引申：personal-agent.md / org-agent.md（阶段二）
            │
            ├─▶ personal-agent.md       ← 依赖：logto-setup.md + quickstart.md
            ├─▶ org-agent.md            ← 依赖：logto-setup.md + quickstart.md
            ├─▶ kill-switch.md          ← 依赖：personal-agent.md 或 org-agent.md
            └─▶ audit-log.md            ← 依赖：quickstart.md
```

---

## 按角色选择入口

| 你的角色 | 建议阅读路径 |
|----------|-------------|
| **产品/架构师** | README → prd.md → overview.md |
| **前端开发者** | logto-setup.md §二（前端 SDK）→ quickstart.md |
| **后端 API 开发者** | logto-setup.md §三（API 保护）→ quickstart.md → personal-agent.md |
| **DevOps / 运维** | prd.md §配置 → upgrade-guide.md |
| **安全工程师** | prd.md §F3 → kill-switch.md → audit-log.md |
| **AI Agent 开发者** | logto-setup.md §四（M2M）→ org-agent.md 或 personal-agent.md |
| **AI 系统（自动读取）** | 按上方①–⑨顺序完整读取 |
