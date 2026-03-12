> **[文档 2/9]** 上一篇：[README（入口索引）](./README.md) → 下一篇：[接入总览](./integration/overview.md)

# WinAMZ 身份认证与 AI Agent 授权平台 — 产品需求文档

## 产品名称

**WinAMZ Identity & AI Agent Authorization Platform**
基于 Logto OSS Fork，专注于企业 AI Agent 身份注册、委托授权与安全治理。

---

## 背景与问题

AI Agent 在企业场景中存在两种本质不同的授权模型：

### 模型一：个人 AI Agent（OpenClaw 模式）

员工的 AI 助手以员工身份代替员工操作业务系统。需要：
- **用户同意流程**：员工主动授权，可随时撤回
- **Actor Token**（RFC 8693）：JWT 中携带 `act.sub = agentId`，资源服务器可区分"谁在代替谁操作"
- **可撤销委托链**：一键 Kill Switch，立即终止 Agent 的所有委托

> Logto 原生 M2M **不满足**此场景——M2M 令牌无法携带用户身份上下文，也不支持用户级别的委托撤销。

### 模型二：企业 AI 助手（Org Agent 模式）

企业级数据处理 AI，代表企业整体执行任务，不绑定具体员工。需要：
- M2M Client Credentials + Organization Token
- 令牌携带 `org_id`，不含 `act` 声明
- 管理员批准后方可获取令牌

> Logto M2M + Organization Token **基本满足**此场景，WinAMZ 在其上增加了注册审批流程和生命周期管理。

---

## 核心概念模型

```
企业 (Organization)
  ├── 员工 (User)
  │     └── 个人 AI Agent (personal)
  │           - 员工授权 → actor token (RFC 8693)
  │           - JWT: { sub: userId, act: { sub: agentId }, scope: "..." }
  │           - 员工或管理员可随时撤销
  │
  └── 企业 AI 助手 (Org Agent)
        - 需管理员批准后生效
        - M2M token + org_id scope
        - JWT: { sub: agentAppId, org_id: orgId, scope: "..." }
        - 挂起即立即停止所有令牌获取能力
```

---

## 功能模块

### F1：AI Agent 注册表

**数据库表：`winamz_agents`**
```sql
CREATE TABLE winamz_agents (
  id             VARCHAR(21) PRIMARY KEY,           -- 全局唯一 ID
  name           VARCHAR(255) NOT NULL,             -- Agent 名称
  type           VARCHAR(20)  NOT NULL              -- 'personal' | 'org'
                 CHECK (type IN ('personal', 'org')),
  org_id         VARCHAR(21)  NOT NULL              -- 所属企业（必须是 Logto Organization）
                 REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id  VARCHAR(21)                        -- personal 类型的所有者用户
                 REFERENCES users(id) ON DELETE SET NULL,
  logto_app_id   VARCHAR(21),                       -- 关联的 Logto M2M 应用 ID（审批后生成）
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending_review'
                 CHECK (status IN ('pending_review','approved','rejected','suspended')),
  requested_scopes TEXT[],                          -- 申请的权限范围
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

**状态流转：**
```
pending_review ──approve──▶ approved ──suspend──▶ suspended
               ──reject──▶ rejected              ──restore──▶ approved
```

---

### F2：个人 Agent 委托流程

**数据库表：`winamz_agent_grants`**
```sql
CREATE TABLE winamz_agent_grants (
  id             VARCHAR(21) PRIMARY KEY,
  agent_id       VARCHAR(21) NOT NULL REFERENCES winamz_agents(id) ON DELETE CASCADE,
  user_id        VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id         VARCHAR(21) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  granted_scopes TEXT[]      NOT NULL,    -- 实际授予的权限（用户确认的）
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,             -- 可选到期时间
  revoked_at     TIMESTAMPTZ,            -- Kill Switch 触发时间
  revoked_by     VARCHAR(21)            -- 执行撤销的管理员/用户 ID
);
```

**JWT 自定义（通过 Logto JWT Customizer 注入 `act` claim，零侵入核心代码）：**
```javascript
// Logto Admin Console → 自定义 JWT → 访问令牌
const getCustomJwtClaims = async ({ token, context, environmentVariables }) => {
  // 查询 WinAMZ 委托记录
  if (context.grant?.type === 'agent_delegation') {
    return {
      act: {
        sub: context.grant.agentId,   // Agent 的唯一 ID
        iss: 'winamz',                // 标识来源
      }
    };
  }
  return {};
};
```

> 参考：[Logto JWT Customizer 文档](https://docs.logto.io/docs/recipes/customize-jwt/)

---

### F3：Kill Switch 安全治理

| 操作对象 | Kill Switch 效果 |
|----------|-----------------|
| 个人 Agent | `winamz_agent_grants.revoked_at` 写入时间戳 + 删除 Logto Grant → Refresh Token 立即失效 |
| 企业 Agent | `winamz_agents.status = 'suspended'` + 吊销 M2M App Secret → 无法获取新令牌 |
| 用户维度批量撤销 | 撤销指定用户名下所有 Agent 的委托（员工离职场景） |
| 组织维度紧急撤销 | 撤销组织下所有 Agent（安全事件应急响应） |

**注意**：现有 Access Token 在到期前仍然有效（默认 1 小时）。如需立即使全部令牌失效，需同时挂起 Agent 账号。

---

### F4：审计日志

**数据库表：`winamz_audit_logs`**
```sql
CREATE TABLE winamz_audit_logs (
  id          VARCHAR(21) PRIMARY KEY,
  event_type  VARCHAR(50) NOT NULL,    -- 事件类型（见下方事件类型表）
  org_id      VARCHAR(21),             -- 相关组织 ID
  agent_id    VARCHAR(21),             -- 相关 Agent ID
  user_id     VARCHAR(21),             -- 相关用户 ID（被代理方）
  actor_id    VARCHAR(21),             -- 操作执行者 ID（管理员）
  resource    TEXT,                    -- 操作资源（如 erp:order:PO-001）
  metadata    JSONB,                   -- 扩展元数据（请求路径、状态码等）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**事件类型：**

| 事件类型 | 触发时机 |
|----------|----------|
| `agent_registered` | 注册新 Agent |
| `agent_approved` | 管理员批准 Agent |
| `agent_suspended` | Agent 被挂起 |
| `grant_created` | 用户授权 Agent |
| `grant_revoked` | 撤销委托（Kill Switch）|
| `agent_action` | 下游系统记录 Agent 操作 |
| `token_issued` | 向 Agent 颁发令牌 |

---

### F5：管理控制台（扩展 Logto Console）

在 Logto Admin Console 中新增「AI Agents」导航区：

| 页面 | 路径 | 功能 |
|------|------|------|
| Agent 注册表 | `/winamz/agents` | 查看/创建/审批/挂起 Agent，支持搜索和分页 |
| 委托授权列表 | `/winamz/grants` | 查看所有委托记录，逐条或批量 Kill Switch |
| 审计日志 | `/winamz/audit` | 查询所有 Agent 操作事件 |

**Agent 详情页** (`/winamz/agents/:id`)：
- 编辑 Agent 名称、权限范围
- 状态操作：Approve / Suspend / Restore
- 危险区：删除 Agent（含二次确认）

---

## 技术路线图

| 阶段 | 任务 | 交付物 |
|------|------|--------|
| P0 | Fork + 本地开发环境搭建 | 可运行的 Logto Fork |
| P1 | WinAMZ DB 迁移 + `/api/winamz/agents` CRUD | Agent 注册表 API |
| P2 | 个人委托流程 + JWT Customizer `act` claim | 完整委托授权链路 |
| P3 | Kill Switch API + 审计日志 | 安全治理能力 |
| P4 | Console UI（三个管理页面） | 可视化管理控制台 |
| P5 | 接入文档 + 端到端验证 | 开发者文档 + 完整闭环测试 |

**当前进度：P0–P4 全部完成。**

---

## API 接口速览

### Agent 注册表 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/winamz/agents` | 列出所有 Agent（分页、可过滤） |
| `POST` | `/api/winamz/agents` | 注册新 Agent |
| `GET` | `/api/winamz/agents/:id` | 获取 Agent 详情 |
| `PATCH` | `/api/winamz/agents/:id` | 更新 Agent 信息 |
| `DELETE` | `/api/winamz/agents/:id` | 删除 Agent |
| `POST` | `/api/winamz/agents/:id/approve` | 审批通过 |
| `POST` | `/api/winamz/agents/:id/suspend` | 挂起 Agent |
| `POST` | `/api/winamz/agents/:id/restore` | 恢复 Agent |

### 委托管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/winamz/grants` | 列出所有委托记录 |
| `POST` | `/api/winamz/grants` | 创建委托记录 |
| `GET` | `/api/winamz/grants/:id` | 获取委托详情 |
| `POST` | `/api/winamz/grants/:id/revoke` | 撤销委托（Kill Switch）|
| `POST` | `/api/winamz/grants/revoke-by-user` | 按用户批量撤销 |

### 审计日志 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/winamz/audit` | 查询审计日志（分页、可过滤）|
| `POST` | `/api/winamz/audit` | 下游系统写入审计事件 |

---

## 环境配置

```bash
# 数据库
DATABASE_URL=postgresql://root:password@localhost:5432/logto

# 服务端口
OIDC_PORT=4001      # OIDC / Management API
ADMIN_PORT=4002     # Admin Console

# 生产环境请使用环境变量，不要硬编码密码
```

---

## 相关参考

- [Logto 官方文档](https://docs.logto.io)
- [Logto 组织（Organization）文档](https://docs.logto.io/docs/recipes/organizations/)
- [Logto M2M 机器对机器文档](https://docs.logto.io/docs/recipes/machine-to-machine/)
- [Logto 保护 API 文档](https://docs.logto.io/docs/recipes/protect-your-api/)
- [Logto JWT 自定义文档](https://docs.logto.io/docs/recipes/customize-jwt/)
- [RFC 8693 — OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
