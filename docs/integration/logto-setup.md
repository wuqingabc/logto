> **[文档 4/9]** 上一篇：[接入总览](./overview.md) → 下一篇：[快速接入指南](./quickstart.md)
> ⚠️ **本文是后续所有 AI Agent 接入文档的前置依赖，请务必先读完本文。**

# Logto 标准接入指南

本文档介绍如何将你的业务系统接入 WinAMZ（基于 Logto）的身份认证体系。
**阅读本文是接入 AI Agent 功能的前提**，AI Agent 的令牌验证、M2M 通信、组织权限均建立在本文的基础之上。

> 官方文档：https://docs.logto.io
> 本文 WinAMZ 实例地址示例：`http://your-host:4001`（OIDC）、`http://your-host:4002`（Admin Console）

---

## 一、核心概念速览

### Logto 是什么

Logto 是一个开源的身份认证服务（Identity Provider，IdP），基于 **OIDC（OpenID Connect）** 和 **OAuth 2.0** 标准协议。它负责：

- 管理用户账号、登录/注册流程
- 向应用颁发 **JWT 访问令牌**（Access Token）
- 管理 API 资源的权限（Scopes）
- 支持多租户组织（Organizations）
- 支持 M2M（机器对机器）服务间认证

### 关键术语

| 术语 | 说明 |
|------|------|
| **Application（应用）** | 在 Logto 中注册的客户端，对应一个 `client_id` |
| **API Resource** | 受保护的 API 端点，对应一个 `audience`（如 `https://api.your-company.com`）|
| **Scope（权限范围）** | API 的细粒度权限，如 `erp:read`、`erp:write` |
| **Organization（组织）** | 多租户单元，代表一个企业/团队 |
| **Access Token** | 短期令牌（默认 1 小时），用于访问 API |
| **Refresh Token** | 长期令牌，用于续期 Access Token（需 `offline_access` scope）|
| **M2M Application** | 用于服务间通信的无用户应用，使用 Client Credentials 流程 |
| **JWKS** | JSON Web Key Set，Logto 的公钥集，用于验证 JWT 签名 |

> 参考：[Logto 核心概念](https://docs.logto.io/docs/references/core/)

---

## 二、前端 Web 应用接入（用户登录）

适用于需要用户登录的 Web 应用（React、Vue、Angular 等）。

### 2.1 在 Admin Console 创建应用

1. 打开 `http://your-host:4002` → **Applications** → **Create application**
2. 选择应用类型：
   - `Single page app`（React、Vue 等 SPA）
   - `Traditional web`（Next.js SSR、Express 等服务端渲染）
   - `Native`（iOS、Android 等移动端）
3. 填写：
   - **Name**：你的应用名，例如 `ERP Web`
   - **Redirect URIs**：登录成功后的回调地址，例如 `http://localhost:3000/callback`
   - **Post sign-out redirect URIs**：登出后跳转地址，例如 `http://localhost:3000`
4. 记录生成的 `App ID`（即 `client_id`）

> 参考：[创建应用](https://docs.logto.io/docs/recipes/integrate-logto/)

### 2.2 安装 Logto SDK

```bash
# React
npm install @logto/react

# Vue
npm install @logto/vue

# 原生 JS（无框架）
npm install @logto/browser

# Next.js
npm install @logto/next

# Node.js（服务端渲染）
npm install @logto/node
```

### 2.3 React 集成示例

```tsx
// src/main.tsx
import { LogtoProvider, LogtoConfig } from '@logto/react';

const config: LogtoConfig = {
  endpoint: 'http://your-host:4001',       // WinAMZ OIDC 端点
  appId: 'your-app-id',                    // Admin Console 中的 App ID
  resources: ['https://erp.your-company.com'],  // 你的 API 资源
  scopes: ['erp:read', 'erp:write'],       // 需要的权限
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <LogtoProvider config={config}>
    <App />
  </LogtoProvider>
);
```

```tsx
// src/App.tsx
import { useLogto } from '@logto/react';

function App() {
  const { isAuthenticated, isLoading, signIn, signOut, getAccessToken } = useLogto();

  if (isLoading) return <div>加载中...</div>;

  if (!isAuthenticated) {
    return (
      <button onClick={() => signIn('http://localhost:3000/callback')}>
        登录
      </button>
    );
  }

  // 获取访问令牌，用于调用后端 API
  const callApi = async () => {
    const token = await getAccessToken('https://erp.your-company.com');
    const resp = await fetch('/api/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return resp.json();
  };

  return (
    <div>
      <p>已登录</p>
      <button onClick={callApi}>调用 API</button>
      <button onClick={() => signOut('http://localhost:3000')}>退出</button>
    </div>
  );
}
```

> 参考：[React SDK 文档](https://docs.logto.io/docs/recipes/integrate-logto/react/)

### 2.4 处理登录回调

```tsx
// src/pages/Callback.tsx
import { useHandleSignInCallback } from '@logto/react';
import { useNavigate } from 'react-router-dom';

function Callback() {
  const navigate = useNavigate();
  const { isLoading } = useHandleSignInCallback(() => {
    navigate('/');  // 登录成功后跳转首页
  });

  return isLoading ? <div>处理登录中...</div> : null;
}
```

### 2.5 获取用户信息

```tsx
import { useLogto } from '@logto/react';

function UserProfile() {
  const { fetchUserInfo } = useLogto();

  const getUser = async () => {
    const user = await fetchUserInfo();
    console.log(user);
    // {
    //   sub: "user-id",
    //   name: "张三",
    //   email: "zhangsan@company.com",
    //   picture: "https://...",
    //   username: "zhangsan"
    // }
  };
}
```

> 参考：[用户信息端点](https://docs.logto.io/docs/references/openid-connect/)

---

## 三、后端 API 接入（保护你的 API）

适用于需要验证前端/Agent 令牌的后端服务。

### 3.1 在 Admin Console 创建 API Resource

1. 进入 **API Resources** → **Create API resource**
2. 填写：
   - **API name**：`ERP API`
   - **API identifier**：`https://erp.your-company.com`（作为 `audience`，建议使用 URL 格式）
3. 添加 Scopes（细粒度权限）：
   - `erp:read` — 读取权限
   - `erp:write` — 写入权限
   - `erp:admin` — 管理权限
4. 保存后，客户端在请求令牌时可通过 `resource` 参数指定此 API

> 参考：[保护你的 API](https://docs.logto.io/docs/recipes/protect-your-api/)

### 3.2 Token 结构说明

用户通过 Logto 登录后获得的 Access Token（JWT）结构：

```json
{
  "sub": "user-id",               // 用户唯一标识
  "iss": "http://your-host:4001/oidc",
  "aud": "https://erp.your-company.com",  // 目标 API（你配置的 API Identifier）
  "scope": "erp:read erp:write",
  "org_id": "company-org-id",     // 组织 ID（如果请求时携带了 organization_id）
  "iat": 1741500000,
  "exp": 1741503600               // 默认 1 小时后过期
}
```

### 3.3 Node.js API 验证中间件

```typescript
// middleware/auth.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';

// JWKS 全局缓存（自动处理密钥轮转）
const JWKS = createRemoteJWKSet(
  new URL('http://your-host:4001/oidc/jwks')
);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.slice(7); // 去掉 "Bearer "

  if (!token) {
    return res.status(401).json({ error: '缺少认证令牌' });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'http://your-host:4001/oidc',           // 必须与 Logto 颁发者一致
      audience: 'https://erp.your-company.com',       // 必须与 API Identifier 一致
    });

    req.user = {
      id: payload.sub!,
      orgId: payload.org_id as string | undefined,
      scopes: (payload.scope as string)?.split(' ') ?? [],
    };

    next();
  } catch (err: any) {
    return res.status(401).json({ error: '令牌验证失败', detail: err.message });
  }
}

// 权限检查中间件
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.scopes.includes(scope)) {
      return res.status(403).json({ error: `缺少权限：${scope}` });
    }
    next();
  };
}
```

**在路由中使用：**
```typescript
import express from 'express';
import { requireAuth, requireScope } from './middleware/auth';

const app = express();

// 所有路由均需认证
app.use(requireAuth);

// 查询订单：需要 erp:read
app.get('/orders', requireScope('erp:read'), async (req, res) => {
  const orders = await db.orders.findMany({ where: { orgId: req.user.orgId } });
  res.json(orders);
});

// 创建订单：需要 erp:write
app.post('/orders', requireScope('erp:write'), async (req, res) => {
  const order = await db.orders.create({
    data: { ...req.body, createdBy: req.user.id },
  });
  res.status(201).json(order);
});
```

### 3.4 Python FastAPI 验证示例

```python
# auth.py
import os, httpx
from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer

security = HTTPBearer()

def get_jwks():
    """获取 Logto JWKS 公钥（生产环境建议加缓存）"""
    resp = httpx.get('http://your-host:4001/oidc/jwks')
    return resp.json()

async def get_current_user(credentials=Depends(security)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            get_jwks(),
            algorithms=['RS256', 'ES256'],
            audience='https://erp.your-company.com',
            issuer='http://your-host:4001/oidc',
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail=str(e))

    return {
        'id': payload['sub'],
        'org_id': payload.get('org_id'),
        'scopes': payload.get('scope', '').split(),
    }
```

### 3.5 OIDC Discovery 自动获取配置

生产环境建议从 Discovery 端点自动获取 issuer、jwks_uri 等配置，而不是硬编码：

```javascript
// 一次性初始化（服务启动时执行）
const discoveryUrl = 'http://your-host:4001/oidc/.well-known/openid-configuration';
const { issuer, jwks_uri } = await fetch(discoveryUrl).then(r => r.json());

const JWKS = createRemoteJWKSet(new URL(jwks_uri));
// 此后用 issuer 和 JWKS 验证所有 token
```

> 参考：[OIDC Discovery 端点](https://docs.logto.io/docs/references/openid-connect/)

---

## 四、M2M（机器对机器）认证

适用于后端服务之间的通信，不涉及用户登录，使用 **Client Credentials** 流程。

### 4.1 创建 M2M 应用

1. 进入 **Applications** → **Create application** → 选择 **Machine-to-machine**
2. 填写 Name，例如 `Data Pipeline`
3. 在 **Permissions** 标签页中：
   - 添加需要访问的 **API Resource** 和对应 Scopes
   - 如需调用 WinAMZ Management API，还需添加 Management API 权限
4. 记录 `App ID`（`client_id`）和生成的 `App secret`（`client_secret`，只显示一次）

> 参考：[M2M 机器对机器文档](https://docs.logto.io/docs/recipes/machine-to-machine/)

### 4.2 获取 M2M Token

```typescript
// services/token.ts

interface TokenCache {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, TokenCache>();

export async function getM2MToken(resource: string): Promise<string> {
  const cacheKey = resource;
  const cached = cache.get(cacheKey);

  // 提前 60 秒续期
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.value;
  }

  const response = await fetch('http://your-host:4001/oidc/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.M2M_CLIENT_ID!,
      client_secret: process.env.M2M_CLIENT_SECRET!,
      resource,                              // 目标 API 资源
      scope: 'read write',                   // 按需填写
    }),
  });

  if (!response.ok) {
    throw new Error(`M2M token 获取失败: ${await response.text()}`);
  }

  const { access_token, expires_in } = await response.json();
  cache.set(cacheKey, {
    value: access_token,
    expiresAt: Date.now() + expires_in * 1000,
  });

  return access_token;
}
```

**调用内部服务：**
```typescript
// 调用另一个后端服务
const token = await getM2MToken('https://inventory.your-company.com');
const resp = await fetch('https://inventory.your-company.com/api/stock', {
  headers: { Authorization: `Bearer ${token}` },
});
```

**调用 Logto Management API：**
```typescript
// Management API 的 resource 固定为 Logto 服务本身的 API 地址
const token = await getM2MToken('https://your-host:4001/api');
const resp = await fetch('http://your-host:4001/api/users', {
  headers: { Authorization: `Bearer ${token}` },
});
```

> 参考：[Management API 使用文档](https://docs.logto.io/docs/recipes/interact-with-management-api/)

---

## 五、Organization（多租户组织）接入

适用于 SaaS 平台或企业内需要多租户隔离的场景。

### 5.1 Organization 的作用

```
Logto Organization 相当于一个"租户容器"：
- 每个 Organization 有自己的成员列表
- Organization Token 中携带 org_id，用于租户数据隔离
- M2M 应用可以限定在某个 Organization 范围内获取令牌
```

### 5.2 创建组织

**通过 Admin Console：**
1. 进入 **Organizations** → **Create organization**
2. 填写 Name，保存后获得 `organization_id`

**通过 Management API：**
```bash
curl -X POST http://your-host:4001/api/organizations \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp", "description": "客户 A" }'
```

### 5.3 将用户添加到组织

```bash
# 将用户添加为组织成员
curl -X POST http://your-host:4001/api/organizations/{orgId}/users \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "userIds": ["user-id-1", "user-id-2"] }'
```

> 参考：[Organizations 文档](https://docs.logto.io/docs/recipes/organizations/)

### 5.4 前端请求带 org_id 的 Token

```typescript
// 在请求 Token 时指定 organization_id
const token = await getAccessToken('https://erp.your-company.com', {
  organizationId: 'company-org-id',  // 指定当前操作所在的组织
});

// 生成的 Token 中将包含：
// {
//   "sub": "user-id",
//   "org_id": "company-org-id",
//   "scope": "erp:read erp:write"
// }
```

### 5.5 后端按组织隔离数据

```typescript
app.get('/orders', requireAuth, async (req, res) => {
  const { id: userId, orgId } = req.user;

  if (!orgId) {
    return res.status(403).json({ error: '当前操作需要指定组织上下文' });
  }

  // 只返回该组织的数据
  const orders = await db.orders.findMany({
    where: { orgId },
  });

  res.json(orders);
});
```

### 5.6 Organization Role（组织角色）

Logto 支持在组织维度定义角色，实现 RBAC（基于角色的访问控制）：

```bash
# 1. 创建组织角色
curl -X POST http://your-host:4001/api/organization-roles \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -d '{ "name": "admin", "description": "组织管理员" }'

# 2. 为角色分配 Scope
curl -X POST http://your-host:4001/api/organization-roles/{roleId}/scopes \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -d '{ "organizationScopeIds": ["scope-id"] }'

# 3. 将用户分配到角色
curl -X POST http://your-host:4001/api/organizations/{orgId}/users/{userId}/roles \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -d '{ "organizationRoleIds": ["role-id"] }'
```

Token 中将包含用户在该组织的角色信息：
```json
{
  "sub": "user-id",
  "org_id": "company-org-id",
  "org_roles": ["admin"],
  "scope": "erp:read erp:write erp:admin"
}
```

> 参考：[Organization 角色与权限](https://docs.logto.io/docs/recipes/organizations/)

---

## 六、完整 Token 结构参考

### 用户 Token（Authorization Code Flow）

```json
{
  "sub": "user-id",
  "iss": "http://your-host:4001/oidc",
  "aud": "https://erp.your-company.com",
  "scope": "erp:read erp:write",
  "org_id": "company-org-id",
  "org_roles": ["member"],
  "name": "张三",
  "username": "zhangsan",
  "email": "zhangsan@company.com",
  "iat": 1741500000,
  "exp": 1741503600
}
```

### M2M Token（Client Credentials Flow）

```json
{
  "sub": "m2m-app-id",
  "iss": "http://your-host:4001/oidc",
  "aud": "https://erp.your-company.com",
  "scope": "erp:read",
  "org_id": "company-org-id",
  "iat": 1741500000,
  "exp": 1741503600
}
```

### 个人 Agent Token（携带 `act` claim，WinAMZ 扩展）

```json
{
  "sub": "user-id",
  "act": { "sub": "agent-id" },
  "iss": "http://your-host:4001/oidc",
  "aud": "https://erp.your-company.com",
  "scope": "erp:write",
  "org_id": "company-org-id",
  "iat": 1741500000,
  "exp": 1741503600
}
```

> `act` claim 是 WinAMZ 通过 [JWT Customizer](https://docs.logto.io/docs/recipes/customize-jwt/) 注入的扩展字段，标准 Logto Token 中不包含。

---

## 七、SDK 快速参考

| 平台 | 包名 | 文档 |
|------|------|------|
| React | `@logto/react` | https://docs.logto.io/docs/recipes/integrate-logto/react/ |
| Vue | `@logto/vue` | https://docs.logto.io/docs/recipes/integrate-logto/vue/ |
| Angular | `@logto/angular` | https://docs.logto.io/docs/recipes/integrate-logto/angular/ |
| Next.js | `@logto/next` | https://docs.logto.io/docs/recipes/integrate-logto/next-js/ |
| Express（后端） | `@logto/express` | https://docs.logto.io/docs/recipes/protect-your-api/node-express/ |
| Python | `logto` | https://docs.logto.io/docs/recipes/integrate-logto/python/ |
| Go | `github.com/logto-io/go` | https://docs.logto.io/docs/recipes/integrate-logto/go/ |
| iOS (Swift) | `Logto` (SPM) | https://docs.logto.io/docs/recipes/integrate-logto/ios/ |
| Android (Kotlin) | `io.logto.sdk:android` | https://docs.logto.io/docs/recipes/integrate-logto/android/ |
| 原生 JS | `@logto/browser` | https://docs.logto.io/docs/recipes/integrate-logto/vanilla-js/ |

---

## 八、常用端点速查

| 端点 | URL | 说明 |
|------|-----|------|
| OIDC Discovery | `GET /oidc/.well-known/openid-configuration` | 获取所有配置信息 |
| JWKS 公钥 | `GET /oidc/jwks` | 用于验证 JWT 签名 |
| 授权端点 | `GET /oidc/auth` | 发起 OAuth 授权（用户登录）|
| 令牌端点 | `POST /oidc/token` | 获取/刷新 Access Token |
| 用户信息端点 | `GET /oidc/me` | 获取当前用户信息（需 Bearer Token）|
| 登出端点 | `GET /oidc/session/end` | 结束 OIDC 会话 |
| Management API | `http://your-host:4001/api/` | 用户/组织/应用管理 |

---

## 九、下一步：接入 WinAMZ AI Agent 功能

完成以上标准 Logto 接入后，你的系统具备了：
- ✅ 用户身份认证（登录/登出）
- ✅ API 令牌验证（`jwtVerify`）
- ✅ 基于 Scope 的权限控制
- ✅ 多租户组织隔离（`org_id`）
- ✅ M2M 服务间认证（`client_credentials`）

在此基础上，接入 WinAMZ AI Agent 功能只需额外处理两件事：

1. **识别 `act` claim**：判断当前请求是员工本人还是 Agent 代理
2. **写入审计日志**：向 WinAMZ 上报 Agent 操作记录

→ 继续阅读 [快速接入指南](./quickstart.md) 了解完整实现
