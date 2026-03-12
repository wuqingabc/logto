> **[文档 7/9]** 上一篇：[个人 Agent 接入](./personal-agent.md) → 下一篇：[Kill Switch API](./kill-switch.md)
> 前置依赖：[文档 4/9 logto-setup.md](./logto-setup.md)（需理解 M2M 认证、Client Credentials Flow）

# 企业 Agent 接入指南

## 场景说明

企业的数据分析 AI（DataPipeline）需要定期读取各部门数据，执行过程不绑定任何具体员工身份，以企业/组织的名义进行。

**授权链路：**
```
DataPipeline → Client Credentials → M2M Token（携带 org_id）→ ERP/数据仓库
```

**JWT 结构（无 `act` claim，`sub` 为 Agent 的应用 ID）：**
```json
{
  "sub": "datapipeline-logto-app-id",  // Agent 的 M2M 应用 ID
  "org_id": "company-org-id",          // 所属企业
  "scope": "erp:read crm:read",
  "iss": "http://your-winamz-host/oidc",
  "aud": "https://erp.your-company.com",
  "exp": 1741600000
}
```

> 参考：[Logto 机器对机器（M2M）文档](https://docs.logto.io/docs/recipes/machine-to-machine/)
> 参考：[Logto 组织（Organization）令牌文档](https://docs.logto.io/docs/recipes/organizations/)

---

## 步骤一：注册企业 Agent

**方式一：通过 Admin Console（推荐）**
1. 打开 `http://your-host:4002`
2. 进入 **AI Agents** → 点击 **+ Create agent**
3. 填写：
   - Name: `DataPipeline-v1`
   - Type: `Organization`
   - Organization: 选择对应企业
4. 提交，状态变为 `pending_review`

**方式二：通过 API**
```bash
curl -X POST http://your-host:4001/api/winamz/agents \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DataPipeline-v1",
    "type": "org",
    "orgId": "company-org-id",
    "requestedScopes": ["erp:read", "crm:read"]
  }'
```

**响应：**
```json
{
  "id": "datapipeline-agent-id",
  "name": "DataPipeline-v1",
  "type": "org",
  "status": "pending_review",
  "requestedScopes": ["erp:read", "crm:read"]
}
```

---

## 步骤二：管理员审批（Admin Console）

1. 打开 Admin Console → **AI Agents**
2. 找到 `pending review` 状态的 DataPipeline-v1
3. 检查申请的权限范围是否合理
4. 点击 **Approve**
5. 系统为该 Agent 创建关联的 Logto M2M 应用
6. 在 Agent 详情页查看生成的 `logtoAppId`

**在 Logto 中为 M2M 应用生成 Client Secret：**
1. 进入 Logto Console → **Applications** → 找到对应的 M2M 应用
2. 在 Credentials 区域生成 `client_secret`（保存好，只显示一次）

> 参考：[Logto M2M 应用管理](https://docs.logto.io/docs/recipes/machine-to-machine/)

---

## 步骤三：Agent 获取 M2M Token

```javascript
// DataPipeline 服务端，使用 Client Credentials 流程获取令牌
async function getAgentToken() {
  const response = await fetch('http://your-host:4001/oidc/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AGENT_CLIENT_ID,       // logtoAppId
      client_secret: process.env.AGENT_CLIENT_SECRET,
      resource: 'https://erp.your-company.com',      // 目标 API 资源
      organization_id: 'company-org-id',             // 必须指定组织
      scope: 'erp:read crm:read',
    }),
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${await response.text()}`);
  }

  const { access_token, expires_in } = await response.json();
  return { access_token, expires_in };
}

// 建议缓存 token，在到期前 60 秒刷新
class TokenCache {
  constructor() {
    this.token = null;
    this.expiresAt = 0;
  }

  async getToken() {
    if (Date.now() < this.expiresAt - 60_000) {
      return this.token;
    }
    const { access_token, expires_in } = await getAgentToken();
    this.token = access_token;
    this.expiresAt = Date.now() + expires_in * 1000;
    return this.token;
  }
}

const tokenCache = new TokenCache();
```

---

## 步骤四：你的系统（ERP）验证 Token

**Node.js 验证中间件：**
```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('http://your-host:4001/oidc/jwks')
);

async function verifyOrgAgentToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'http://your-host:4001/oidc',
      audience: 'https://erp.your-company.com',
    });

    // 企业 Agent：无 act claim，sub 是 Agent 的应用 ID
    req.agentAppId = payload.sub;
    req.orgId = payload.org_id;
    req.scopes = payload.scope?.split(' ') ?? [];

    // 判断是否为合法企业 Agent（有 org_id，无 act claim）
    req.isOrgAgent = !!payload.org_id && !payload.act;

    // 权限检查
    if (!req.scopes.includes('erp:read')) {
      return res.status(403).json({ error: 'Missing required scope: erp:read' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', detail: err.message });
  }
}
```

**与个人 Agent 的区分逻辑（通用中间件）：**
```javascript
async function resolveCallerIdentity(req, res, next) {
  const { payload } = await jwtVerify(token, JWKS, { ... });

  if (payload.act?.sub) {
    // 个人 Agent：代替员工操作
    req.callerType = 'personal_agent';
    req.userId = payload.sub;        // 员工（权限主体）
    req.agentId = payload.act.sub;   // Agent（执行者）
  } else if (payload.org_id) {
    // 企业 Agent（或 M2M 服务）
    req.callerType = 'org_agent';
    req.agentAppId = payload.sub;
    req.orgId = payload.org_id;
  } else {
    // 员工本人操作
    req.callerType = 'user';
    req.userId = payload.sub;
  }

  next();
}
```

---

## 步骤五：写入审计日志

```javascript
// 企业 Agent 操作审计
async function logOrgAgentAction(req, res, operationResult) {
  await fetch('http://your-host:4001/api/winamz/audit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await tokenCache.getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'agent_action',
      agent_id: req.agentAppId,
      org_id: req.orgId,
      // user_id 不填，因为企业 Agent 不代表任何具体员工
      resource: `${req.method.toLowerCase()}:${req.path}`,
      metadata: {
        records_processed: operationResult.count,
        status_code: res.statusCode,
      },
    }),
  });
}
```

---

## 完整时序图

```
DataPipeline 服务              WinAMZ OIDC              你的 ERP 系统
      │                              │                        │
      │  POST /oidc/token            │                        │
      │  (client_credentials)        │                        │
      │─────────────────────────────>│                        │
      │  access_token                │                        │
      │  { sub: "datapipeline-app"   │                        │
      │    org_id: "company"         │                        │
      │    scope: "erp:read" }       │                        │
      │<─────────────────────────────│                        │
      │                              │                        │
      │  GET /reports/monthly        │                        │
      │  Authorization: Bearer <token>                        │
      │──────────────────────────────────────────────────────>│
      │                              │  jwtVerify 成功        │
      │                              │  agentAppId="pipeline" │
      │                              │  orgId="company"       │
      │  200 OK + 报告数据            │  isOrgAgent=true       │
      │<──────────────────────────────────────────────────────│
```

---

## Kill Switch：挂起企业 Agent

```bash
# 方式一：Admin Console → AI Agents → 找到 Agent → Suspend

# 方式二：API
curl -X POST http://your-host:4001/api/winamz/agents/{agentId}/suspend \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**挂起效果：**
1. `winamz_agents.status` 设为 `suspended`
2. 关联 Logto M2M 应用的 Secret 被吊销
3. Agent 无法再获取新令牌
4. 现有 Access Token 在到期前仍有效（建议设置较短 TTL ≤ 1 小时）

**恢复 Agent：**
```bash
curl -X POST http://your-host:4001/api/winamz/agents/{agentId}/restore \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# 注意：需要在 Logto 中重新生成 client_secret
```
