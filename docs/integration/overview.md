> **[文档 3/9]** 上一篇：[产品需求文档](../prd.md) → 下一篇：[Logto 标准接入指南](./logto-setup.md)

# 接入总览

WinAMZ 为下游业务系统提供两种 AI Agent 授权接入方案：

| 接入场景 | 你的系统类型 | 接入方式 |
|----------|-------------|----------|
| **代替员工操作** | ERP、CRM、OA、邮件等员工业务系统 | 验证 personal agent token（检查 `act` claim）|
| **代表企业执行** | 数据管道、批处理服务、分析平台 | 验证 M2M token（检查 `org_id` claim）|

---

## 核心原则

### 1. 你的系统只需验证 JWT，无需改动认证逻辑

WinAMZ 基于标准 OIDC/OAuth 2.0 协议。你的系统只需：
- 从 WinAMZ 的 JWKS 端点获取公钥
- 用标准 `jose` / `jsonwebtoken` 库验证 JWT 签名
- 读取 `act.sub`（个人 Agent）或 `org_id`（企业 Agent）字段

> 参考：[Logto 保护你的 API](https://docs.logto.io/docs/recipes/protect-your-api/)

### 2. Token 结构对比

| 令牌类型 | `sub` | `act.sub` | `org_id` | 语义 |
|----------|-------|-----------|----------|------|
| 员工直接操作 | userId | 不存在 | orgId | 员工本人操作 |
| 个人 Agent 代理 | userId | agentId | orgId | Agent 代替员工操作 |
| 企业 Agent | agentAppId | 不存在 | orgId | 企业 Agent 自主执行 |

**关键判断逻辑：**
```javascript
const isPersonalAgent = !!payload.act?.sub;    // act.sub 存在 = 个人 Agent
const isOrgAgent = !payload.act && !!payload.org_id && payload.iss !== payload.sub;
const isHumanUser = !payload.act && !!payload.sub;
```

### 3. 审计日志是你的责任

WinAMZ 记录 Agent 生命周期事件（注册、审批、挂起、委托创建/撤销），但**业务操作审计需要你的系统主动上报**：

```javascript
// 每次 Agent 操作完成后，调用 WinAMZ 审计 API 写入记录
await fetch('http://your-winamz-host/api/winamz/audit', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${winamzM2mToken}` },
  body: JSON.stringify({
    event_type: 'agent_action',
    agent_id: req.agentId,
    user_id: req.userId,
    resource: `${req.method}:${req.path}`,
    metadata: { status_code: res.statusCode },
  }),
});
```

---

## 接入流程选择

```
你需要让 Agent 代替员工操作？
│
├─ 是 → 个人 Agent 接入
│        → 参见 personal-agent.md
│
└─ 否 → Agent 以企业身份独立执行？
         │
         ├─ 是 → 企业 Agent 接入
         │        → 参见 org-agent.md
         │
         └─ 两者都需要 → 分别接入两种场景
```

---

## WinAMZ 服务端点

| 服务 | 地址 | 用途 |
|------|------|------|
| OIDC 端点 | `http://your-host:4001/oidc` | 令牌颁发、JWKS 公钥 |
| Management API | `http://your-host:4001/api` | WinAMZ API（Agent CRUD、Kill Switch、审计）|
| Admin Console | `http://your-host:4002` | 管理控制台（注册 Agent、查看委托、审计日志）|

**OIDC Discovery（自动获取所有端点）：**
```
GET http://your-host:4001/oidc/.well-known/openid-configuration
```

**JWKS 公钥端点：**
```
GET http://your-host:4001/oidc/jwks
```

> 参考：[Logto OIDC 端点参考](https://docs.logto.io/docs/references/openid-connect/)

---

## 详细接入文档（推荐阅读顺序）

1. [**Logto 标准接入指南**](./logto-setup.md) — **必读** 用户登录、API 保护、M2M、Organization 多租户
2. [**快速接入指南**](./quickstart.md) — 接入全景图 + 完整代码路径（Logto 基础 → AI Agent 叠加）
3. [个人 Agent 接入指南](./personal-agent.md) — 员工委托场景完整流程
4. [企业 Agent 接入指南](./org-agent.md) — M2M 企业场景完整流程
5. [Kill Switch API 参考](./kill-switch.md) — 紧急撤销操作
6. [审计日志 API 参考](./audit-log.md) — 审计事件写入与查询
