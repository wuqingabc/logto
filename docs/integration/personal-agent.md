> **[文档 6/9]** 上一篇：[快速接入指南](./quickstart.md) → 下一篇：[企业 Agent 接入](./org-agent.md)
> 前置依赖：[文档 4/9 logto-setup.md](./logto-setup.md)（需理解 Authorization Code Flow、jwtVerify、Organization）

# 个人 Agent 接入指南

## 场景说明

员工张三使用 OpenClaw AI 助手，希望 OpenClaw 能以张三的身份调用公司的 ERP 系统、CRM 等业务系统。

**授权链路：**
```
张三（员工）→ 授权 OpenClaw → OpenClaw 携带 actor token → ERP/CRM 接受并记录
```

**JWT 结构（`act` claim 标识代理关系）：**
```json
{
  "sub": "zhangsan-user-id",     // 被代理的员工 ID（权限主体）
  "act": {
    "sub": "openclaw-agent-id"   // 代理执行的 Agent ID
  },
  "org_id": "company-org-id",
  "scope": "erp:read erp:write",
  "iss": "http://your-winamz-host/oidc",
  "aud": "https://erp.your-company.com",
  "exp": 1741600000
}
```

> 参考 RFC：[RFC 8693 — OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)（`act` claim 定义）

---

## 步骤一：在 WinAMZ 中注册你的 API 资源

在 WinAMZ Admin Console (`http://your-host:4002`) 中：

1. 进入 **API Resources** → 点击 **Create API resource**
2. 填写 API Identifier（建议使用 URL 格式）：`https://erp.your-company.com`
3. 创建权限 Scope：
   - `erp:read` — 读取数据
   - `erp:write` — 创建/修改数据
   - `erp:admin` — 管理员操作
4. 保存

> 参考：[Logto API 资源文档](https://docs.logto.io/docs/recipes/protect-your-api/node-express/)

---

## 步骤二：注册 Agent（由 Agent 开发方完成）

```bash
# OpenClaw 开发方调用 WinAMZ API 注册 Agent
curl -X POST http://your-host:4001/api/winamz/agents \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenClaw v2.1",
    "type": "personal",
    "orgId": "company-org-id",
    "ownerUserId": "zhangsan-user-id",
    "requestedScopes": ["erp:read", "erp:write"]
  }'
```

**响应：**
```json
{
  "id": "openclaw-agent-id",
  "name": "OpenClaw v2.1",
  "type": "personal",
  "status": "pending_review",
  "requestedScopes": ["erp:read", "erp:write"],
  "createdAt": "2026-03-11T10:00:00Z"
}
```

管理员在 Console 中批准后，Agent 状态变为 `approved`。

---

## 步骤三：OpenClaw 发起 OAuth 授权（用户同意流程）

员工需要主动授权 OpenClaw 代替自己操作：

```javascript
// OpenClaw 客户端构造授权 URL，引导员工在浏览器中完成同意
const authUrl = new URL('http://your-host:4001/oidc/auth');
authUrl.searchParams.set('client_id', 'openclaw-oidc-app-id');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', 'openclaw://callback');
authUrl.searchParams.set('scope', 'openid offline_access erp:read erp:write');
authUrl.searchParams.set('resource', 'https://erp.your-company.com');
authUrl.searchParams.set('organization_id', 'company-org-id');
// 可选：state 参数用于防 CSRF
authUrl.searchParams.set('state', crypto.randomUUID());

// 员工看到 WinAMZ 同意页面，确认授权 OpenClaw 请求的权限
// 同意后回调 redirect_uri，携带 authorization code
```

**用 code 换取 tokens：**
```javascript
const response = await fetch('http://your-host:4001/oidc/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'openclaw-oidc-app-id',
    client_secret: 'openclaw-client-secret',
    code: authorizationCode,
    redirect_uri: 'openclaw://callback',
  }),
});
const { access_token, refresh_token } = await response.json();
// access_token 中包含 act.sub = openclaw-agent-id
```

> 参考：[Logto 传统 Web 应用接入文档](https://docs.logto.io/docs/recipes/integrate-logto/vanilla-js/)

---

## 步骤四：你的系统（ERP）验证 Token

**安装依赖：**
```bash
# Node.js
npm install jose

# Python
pip install python-jose cryptography

# Go
go get github.com/lestrrat-go/jwx/v2
```

**Node.js 验证中间件（Express）：**
```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose';

// 缓存 JWKS，避免每次请求都拉取
const JWKS = createRemoteJWKSet(
  new URL('http://your-host:4001/oidc/jwks')
);

async function verifyAgentToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'http://your-host:4001/oidc',   // 必须匹配
      audience: 'https://erp.your-company.com', // 必须匹配你的 API Identifier
    });

    // 提取身份上下文
    req.userId = payload.sub;                      // 员工 ID（权限主体，始终是人）
    req.agentId = payload.act?.sub ?? null;        // Agent ID，null = 员工本人操作
    req.orgId = payload.org_id;
    req.isAgent = !!payload.act?.sub;

    // 权限检查（可选，jose 也可在 jwtVerify 中直接验证）
    const requiredScope = req.route?.requiredScope;
    if (requiredScope && !payload.scope?.split(' ').includes(requiredScope)) {
      return res.status(403).json({ error: 'Insufficient scope' });
    }

    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// 在路由中使用
app.post('/purchase-orders', verifyAgentToken, async (req, res) => {
  // req.userId = "zhangsan-id"（张三的权限）
  // req.agentId = "openclaw-agent-id"（OpenClaw 代替操作）
  // req.isAgent = true

  // 审计日志中同时记录 userId 和 agentId
  await createPurchaseOrder({ ...req.body, createdBy: req.userId, agent: req.agentId });
  res.status(201).json({ success: true });
});
```

**Python 验证示例（FastAPI）：**
```python
import httpx
from jose import jwt, JWTError
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

# 获取 JWKS
def get_jwks():
    response = httpx.get("http://your-host:4001/oidc/jwks")
    return response.json()

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    token = credentials.credentials
    jwks = get_jwks()

    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256", "ES256"],
            audience="https://erp.your-company.com",
            issuer="http://your-host:4001/oidc",
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    return {
        "user_id": payload["sub"],
        "agent_id": payload.get("act", {}).get("sub"),  # None 表示用户本人操作
        "org_id": payload.get("org_id"),
        "is_agent": "act" in payload,
    }
```

---

## 步骤五：写入审计日志

每次 Agent 操作完成后，调用 WinAMZ 审计 API 记录操作行为：

```javascript
// 建议封装为独立函数，并确保不影响主业务（fire-and-forget）
async function logAgentAction(req, res) {
  if (!req.isAgent) return;  // 只记录 Agent 操作

  try {
    await fetch('http://your-host:4001/api/winamz/audit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WINAMZ_M2M_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'agent_action',
        agent_id: req.agentId,
        user_id: req.userId,
        org_id: req.orgId,
        resource: `${req.method.toLowerCase()}:${req.path}`,
        metadata: {
          method: req.method,
          path: req.path,
          status_code: res.statusCode,
          body_size: req.headers['content-length'],
        },
      }),
    });
  } catch (err) {
    // 审计日志写入失败不应影响主业务
    console.error('Audit log failed:', err.message);
  }
}
```

> 如何获取 `WINAMZ_M2M_TOKEN`：参见 [企业 Agent 接入指南](./org-agent.md) 中的 M2M 认证部分。

---

## 完整时序图

```
员工张三               OpenClaw              WinAMZ OIDC          你的 ERP 系统
    │                     │                       │                      │
    │ 点击"授权 OpenClaw"  │                       │                      │
    │────────────────────>│                       │                      │
    │                     │  发起 /oidc/auth 授权  │                      │
    │                     │──────────────────────>│                      │
    │  展示同意页面        │                       │                      │
    │<────────────────────────────────────────────│                      │
    │ 点击"同意"           │                       │                      │
    │────────────────────────────────────────────>│                      │
    │                     │  返回 authorization_code                      │
    │                     │<──────────────────────│                      │
    │                     │  /oidc/token (code 换 tokens)                 │
    │                     │──────────────────────>│                      │
    │                     │  access_token         │                      │
    │                     │  { sub: "zhangsan"    │                      │
    │                     │    act: { sub: "openclaw" }                  │
    │                     │    scope: "erp:write" }                      │
    │                     │<──────────────────────│                      │
    │                     │                       │                      │
    │                     │  POST /purchase-orders │                      │
    │                     │  Authorization: Bearer <token>               │
    │                     │──────────────────────────────────────────────>
    │                     │                       │  jwtVerify 成功       │
    │                     │                       │  userId="zhangsan"    │
    │                     │                       │  agentId="openclaw"   │
    │                     │                       │                       │ 写入审计日志
    │                     │  201 Created          │                       │
    │                     │<──────────────────────────────────────────────
```

---

## Kill Switch：撤销 Agent 委托

员工离职或主动撤权时：

```bash
# 方式一：通过 Admin Console（AI Agents → Delegations → Revoke）

# 方式二：通过 API（管理员操作）
curl -X POST http://your-host:4001/api/winamz/grants/{grantId}/revoke \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "员工离职" }'

# 方式三：批量撤销（撤销某员工的所有 Agent 委托）
curl -X POST http://your-host:4001/api/winamz/grants/revoke-by-user \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "zhangsan-user-id", "reason": "员工离职" }'
```

**撤销效果：**
1. `winamz_agent_grants.revoked_at` 写入当前时间
2. Logto 中该用户对该 Client 的所有 Grant 被删除
3. Refresh Token 立即失效，无法续期
4. 现有 Access Token 在到期前仍有效（默认 1 小时）

> 如需立即使所有令牌失效，追加调用挂起接口：参见 [Kill Switch 完整文档](./kill-switch.md)
