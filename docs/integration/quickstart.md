> **[文档 5/9]** 上一篇：[Logto 标准接入指南](./logto-setup.md) → 下一篇：[个人 Agent 接入](./personal-agent.md) 或 [企业 Agent 接入](./org-agent.md)
> 前置依赖：请先阅读 [文档 4/9 logto-setup.md](./logto-setup.md)

# 快速接入指南

本文档是接入 WinAMZ 的完整路径索引，按照**先接入 Logto 标准认证，再叠加 AI Agent 能力**的顺序组织。

---

## 接入全景图

```
你的业务系统
    │
    ▼
【阶段一：Logto 标准接入】─────────────────────────────────────
│  1. 用户身份认证（前端登录/登出）
│  2. 后端 API 令牌验证（jwtVerify）
│  3. 基于 Scope 的权限控制
│  4. 多租户组织（org_id 数据隔离）
│  5. M2M 服务间认证（Client Credentials）
│
│  参见：logto-setup.md
─────────────────────────────────────────────────────────────
    │
    ▼
【阶段二：WinAMZ AI Agent 叠加】────────────────────────────────
│  在已有 jwtVerify 基础上额外处理：
│  1. 识别 act.sub（区分员工本人 vs Agent 代理）
│  2. 写入 WinAMZ 审计日志
│
│  参见：personal-agent.md / org-agent.md
─────────────────────────────────────────────────────────────
```

---

## 阶段一：Logto 标准接入

> 详细内容请阅读 [Logto 标准接入指南](./logto-setup.md)，本节为关键步骤速览。

### 步骤 1：创建应用和 API 资源（Admin Console）

| 操作 | 位置 | 说明 |
|------|------|------|
| 创建 Web 应用 | Applications → Create | 获取 `client_id`，用于前端登录 |
| 创建 API Resource | API Resources → Create | 设置 `audience`（如 `https://erp.your-company.com`）和 Scopes |
| 创建 M2M 应用 | Applications → Create → M2M | 用于服务间通信和审计日志写入 |

### 步骤 2：前端集成登录

```bash
npm install @logto/react  # 或 @logto/vue / @logto/next
```

```tsx
// 最简配置
import { LogtoProvider } from '@logto/react';

<LogtoProvider config={{
  endpoint: 'http://your-host:4001',
  appId: 'your-app-id',
  resources: ['https://erp.your-company.com'],
  scopes: ['erp:read', 'erp:write'],
}}>
  <App />
</LogtoProvider>
```

```tsx
// 触发登录/登出
const { signIn, signOut, isAuthenticated, getAccessToken } = useLogto();

// 获取令牌调用 API
const token = await getAccessToken('https://erp.your-company.com');
fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
```

> 完整 SDK 列表和各平台示例：[logto-setup.md → 第二节](./logto-setup.md#二前端-web-应用接入用户登录)

### 步骤 3：后端 API 验证令牌

```bash
npm install jose
```

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

// 全局初始化一次
const JWKS = createRemoteJWKSet(new URL('http://your-host:4001/oidc/jwks'));

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'http://your-host:4001/oidc',
    audience: 'https://erp.your-company.com',
  });
  req.user = { id: payload.sub, orgId: payload.org_id, scopes: payload.scope?.split(' ') ?? [] };
  next();
}
```

> 完整中间件（含权限检查、Python/Go 示例）：[logto-setup.md → 第三节](./logto-setup.md#三后端-api-接入保护你的-api)

### 步骤 4：M2M 服务间认证（Client Credentials）

```typescript
// 用于服务间调用或调用 WinAMZ Management API
const resp = await fetch('http://your-host:4001/oidc/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.M2M_CLIENT_ID!,
    client_secret: process.env.M2M_CLIENT_SECRET!,
    resource: 'https://erp.your-company.com',
    scope: 'erp:read',
  }),
});
const { access_token } = await resp.json();
```

> 完整 Token 缓存实现：[logto-setup.md → 第四节](./logto-setup.md#四m2m机器对机器认证)

---

## 阶段二：WinAMZ AI Agent 叠加

完成阶段一后，你的系统已经能够验证所有标准 Logto 令牌。AI Agent 令牌是标准 Logto 令牌的超集——在现有 `jwtVerify` 验证通过后，**额外检查 `act.sub` 字段**即可。

### 核心区别：一行代码判断调用者类型

```typescript
const { payload } = await jwtVerify(token, JWKS, { issuer, audience });

// ① 员工本人操作（标准 Logto 令牌，无 act）
// ② 个人 Agent 代替员工操作（WinAMZ 扩展，有 act.sub）
// ③ 企业 Agent 自主操作（M2M 令牌，有 org_id，无 act，sub 是应用 ID）

const callerType = payload.act?.sub
  ? 'personal_agent'           // ② Agent 代理员工
  : payload.org_id && !payload.name
    ? 'org_agent'              // ③ 企业 Agent
    : 'user';                  // ① 员工本人
```

### 步骤 5：扩展现有中间件，识别 Agent 身份

```typescript
// 在原有 requireAuth 基础上增加 AI Agent 判断
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  const { payload } = await jwtVerify(token, JWKS, { issuer, audience });

  // ──── 已有逻辑（Logto 标准）────
  const scopes = (payload.scope as string)?.split(' ') ?? [];

  // ──── 新增：AI Agent 扩展识别 ────
  if (payload.act?.sub) {
    // 个人 Agent：sub=员工ID，act.sub=AgentID
    req.user = {
      id: payload.sub,
      agentId: payload.act.sub as string,  // ← 新增
      orgId: payload.org_id as string,
      scopes,
      callerType: 'personal_agent',
    };
  } else {
    // 员工本人或企业 Agent（无 act claim）
    req.user = {
      id: payload.sub,
      orgId: payload.org_id as string,
      scopes,
      callerType: payload.org_id ? 'org_agent' : 'user',
    };
  }

  next();
}
```

### 步骤 6：写入审计日志（仅 Agent 操作时）

```typescript
// 在 Response 发送后，非阻塞写入审计日志
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    originalJson(body);

    if (req.user?.agentId) {  // 只有 Agent 操作才写审计
      fetch('http://your-host:4001/api/winamz/audit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WINAMZ_M2M_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'agent_action',
          agent_id: req.user.agentId,
          user_id: req.user.id,
          org_id: req.user.orgId,
          resource: `${req.method.toLowerCase()}:${req.path}`,
          metadata: { status_code: res.statusCode },
        }),
      }).catch(console.error);
    }

    return res;
  };
  next();
});
```

---

## 完整接入清单

### Logto 标准接入

- [ ] 在 Admin Console 创建 Web 应用，获取 `client_id`
- [ ] 在 Admin Console 创建 API Resource，配置 `audience` 和 Scopes
- [ ] 前端安装 Logto SDK，实现登录/登出/获取 Token
- [ ] 后端实现 `jwtVerify` 中间件，验证 `issuer` 和 `audience`
- [ ] 按需实现 Scope 权限检查
- [ ] 如需多租户：请求 Token 时携带 `organization_id`，后端按 `org_id` 隔离数据
- [ ] 如需 M2M：创建 M2M 应用，用 Client Credentials 获取 Token

### WinAMZ AI Agent 叠加

- [ ] 在 WinAMZ Admin Console 创建 M2M 应用（用于写审计日志），配置 Management API 权限
- [ ] 在现有中间件中添加 `act.sub` 检查，识别 Agent 身份
- [ ] 添加审计日志中间件，Agent 操作后自动上报
- [ ] 在数据库记录 `created_by_agent` 字段（可选，用于业务追溯）

---

## 详细文档索引

| 文档 | 适用场景 |
|------|----------|
| [Logto 标准接入指南](./logto-setup.md) | **必读** — Logto 基础接入全面介绍 |
| [接入总览](./overview.md) | AI Agent 两种场景对比 |
| [个人 Agent 接入](./personal-agent.md) | 员工委托 AI 代理操作业务系统 |
| [企业 Agent 接入](./org-agent.md) | 企业级 M2M Agent 自主执行 |
| [Kill Switch API](./kill-switch.md) | 紧急撤销 Agent 授权 |
| [审计日志 API](./audit-log.md) | 查询与写入审计事件 |

---

## Logto 官方文档链接

| 主题 | 链接 |
|------|------|
| 快速开始总览 | https://docs.logto.io/docs/recipes/integrate-logto/ |
| React SDK | https://docs.logto.io/docs/recipes/integrate-logto/react/ |
| Vue SDK | https://docs.logto.io/docs/recipes/integrate-logto/vue/ |
| Next.js SDK | https://docs.logto.io/docs/recipes/integrate-logto/next-js/ |
| 保护后端 API | https://docs.logto.io/docs/recipes/protect-your-api/ |
| M2M 机器对机器 | https://docs.logto.io/docs/recipes/machine-to-machine/ |
| Organizations 多租户 | https://docs.logto.io/docs/recipes/organizations/ |
| Organization 角色与权限 | https://docs.logto.io/docs/recipes/organizations/ |
| JWT 自定义（act claim） | https://docs.logto.io/docs/recipes/customize-jwt/ |
| Management API 使用 | https://docs.logto.io/docs/recipes/interact-with-management-api/ |
| OIDC 端点参考 | https://docs.logto.io/docs/references/openid-connect/ |
| RFC 8693 Token Exchange | https://datatracker.ietf.org/doc/html/rfc8693 |
