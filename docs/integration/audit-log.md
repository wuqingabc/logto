> **[文档 9/9]** 上一篇：[Kill Switch API](./kill-switch.md) → 本系列文档已读完
> 前置依赖：[文档 5/9 quickstart.md](./quickstart.md)（需理解 M2M Token 获取方式）

# 审计日志 API 参考

WinAMZ 审计日志分为两类：
- **系统自动写入**：Agent 生命周期事件（注册、审批、挂起）和委托事件（授权、撤销）
- **下游系统主动上报**：具体业务操作（Agent 代替用户执行了什么操作）

---

## 查询审计日志

```
GET /api/winamz/audit
Authorization: Bearer $M2M_TOKEN
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `agent_id` | string | 按 Agent ID 过滤 |
| `user_id` | string | 按用户 ID 过滤（查看某员工被哪些 Agent 代理操作过）|
| `org_id` | string | 按组织 ID 过滤 |
| `event_type` | string | 按事件类型过滤（见下方事件类型表）|
| `from` | ISO 8601 | 开始时间，例如 `2026-01-01T00:00:00Z` |
| `to` | ISO 8601 | 结束时间 |
| `page` | number | 页码，默认 1 |
| `page_size` | number | 每页条数，默认 20，最大 100 |

**常用查询示例：**

```bash
# 查询某 Agent 的所有操作记录
GET /api/winamz/audit?agent_id=openclaw-agent-id&page=1&page_size=50

# 查询某员工被代理操作的所有记录（追溯员工行为）
GET /api/winamz/audit?user_id=zhangsan-user-id&event_type=agent_action

# 查询某组织的所有 Kill Switch 操作（合规审查）
GET /api/winamz/audit?org_id=company-org-id&event_type=grant_revoked

# 查询某时间段内的所有审批事件
GET /api/winamz/audit?event_type=agent_approved&from=2026-01-01T00:00:00Z&to=2026-03-31T23:59:59Z
```

**响应示例：**
```json
[
  {
    "id": "log-abc123",
    "eventType": "agent_action",
    "agentId": "openclaw-agent-id",
    "userId": "zhangsan-user-id",
    "orgId": "company-org-id",
    "resource": "post:/purchase-orders",
    "metadata": {
      "method": "POST",
      "path": "/purchase-orders",
      "statusCode": 201,
      "amount": 5000
    },
    "createdAt": "2026-03-11T09:30:00Z"
  }
]
```

响应头中包含分页信息：
```
Total-Number: 42
```

---

## 下游系统写入审计事件

```
POST /api/winamz/audit
Authorization: Bearer $M2M_TOKEN
Content-Type: application/json
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `event_type` | string | ✅ | 事件类型（建议使用 `agent_action`）|
| `agent_id` | string | ✅ | 执行操作的 Agent ID |
| `user_id` | string | 个人 Agent 必填 | 被代理的用户 ID |
| `org_id` | string | 推荐 | 所属组织 ID |
| `resource` | string | 推荐 | 操作的资源标识，如 `post:/orders` |
| `metadata` | object | 推荐 | 扩展字段（状态码、数据量等）|

**请求示例：**
```bash
curl -X POST http://your-host:4001/api/winamz/audit \
  -H "Authorization: Bearer $M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "agent_action",
    "agent_id": "openclaw-agent-id",
    "user_id": "zhangsan-user-id",
    "org_id": "company-org-id",
    "resource": "post:/purchase-orders",
    "metadata": {
      "method": "POST",
      "path": "/purchase-orders",
      "status_code": 201,
      "order_id": "PO-2026-001",
      "amount": 5000
    }
  }'
```

---

## 事件类型完整列表

| 事件类型 | 触发方 | 核心字段 | 说明 |
|----------|--------|----------|------|
| `agent_registered` | WinAMZ 系统 | `agent_id`, `org_id` | 新 Agent 注册提交审批 |
| `agent_approved` | WinAMZ 系统 | `agent_id`, `actor_id` | 管理员批准 Agent |
| `agent_suspended` | WinAMZ 系统 | `agent_id`, `actor_id` | Agent 被挂起 |
| `grant_created` | WinAMZ 系统 | `agent_id`, `user_id` | 用户完成 OAuth 同意，委托创建 |
| `grant_revoked` | WinAMZ 系统 | `agent_id`, `user_id`, `actor_id` | Kill Switch 触发，委托撤销 |
| `agent_action` | **下游系统上报** | `agent_id`, `user_id`, `resource` | Agent 代替用户执行了业务操作 |
| `token_issued` | WinAMZ 系统 | `agent_id` | 向 Agent 颁发令牌 |

---

## 推荐：下游系统审计中间件

将审计逻辑封装为 Express 中间件，所有请求自动上报：

**Node.js / Express：**
```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose';

// 复用 M2M token（不要每次请求都重新获取）
const winamzTokenCache = {
  token: null,
  expiresAt: 0,
  async get() {
    if (Date.now() < this.expiresAt - 60_000) return this.token;
    const resp = await fetch('http://your-host:4001/oidc/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.WINAMZ_M2M_CLIENT_ID,
        client_secret: process.env.WINAMZ_M2M_CLIENT_SECRET,
        resource: 'https://your-host:4001/api',
        scope: 'all',
      }),
    });
    const { access_token, expires_in } = await resp.json();
    this.token = access_token;
    this.expiresAt = Date.now() + expires_in * 1000;
    return this.token;
  }
};

// 审计中间件（在 response 发送后非阻塞执行）
function winamzAuditMiddleware(req, res, next) {
  // 保存原始 send 方法
  const originalSend = res.send.bind(res);

  res.send = function(body) {
    originalSend(body);

    // 仅在 Agent 操作时上报审计日志
    if (req.isAgent && req.agentId) {
      winamzTokenCache.get()
        .then(token => fetch('http://your-host:4001/api/winamz/audit', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: 'agent_action',
            agent_id: req.agentId,
            user_id: req.userId,           // 个人 Agent 必须有
            org_id: req.orgId,
            resource: `${req.method.toLowerCase()}:${req.path}`,
            metadata: {
              method: req.method,
              path: req.path,
              status_code: res.statusCode,
              query: req.query,
            },
          }),
        }))
        .catch(err => console.error('[WinAMZ Audit] Failed to log:', err.message));
    }

    return res;
  };

  next();
}

// 注册中间件（在身份验证中间件之后）
app.use(verifyAgentToken);    // 先验证 token，设置 req.isAgent 等字段
app.use(winamzAuditMiddleware); // 再注册审计中间件
```

**Python / FastAPI：**
```python
import asyncio
import httpx
from starlette.middleware.base import BaseHTTPMiddleware

class WinamzAuditMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, winamz_host: str, m2m_token_getter):
        super().__init__(app)
        self.winamz_host = winamz_host
        self.get_m2m_token = m2m_token_getter

    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # 异步非阻塞写入审计日志
        agent_id = getattr(request.state, "agent_id", None)
        user_id = getattr(request.state, "user_id", None)

        if agent_id:
            asyncio.create_task(self._log_action(request, response, agent_id, user_id))

        return response

    async def _log_action(self, request, response, agent_id, user_id):
        try:
            token = await self.get_m2m_token()
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.winamz_host}/api/winamz/audit",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "event_type": "agent_action",
                        "agent_id": agent_id,
                        "user_id": user_id,
                        "resource": f"{request.method.lower()}:{request.url.path}",
                        "metadata": {
                            "method": request.method,
                            "path": str(request.url.path),
                            "status_code": response.status_code,
                        },
                    },
                )
        except Exception as e:
            print(f"[WinAMZ Audit] Failed: {e}")
```

---

## 合规场景示例

**场景：季度合规审计，导出所有 Agent 操作记录**
```bash
# 分页导出（每次 100 条）
for page in 1 2 3 4 5; do
  curl -s "http://your-host:4001/api/winamz/audit?\
    from=2026-01-01T00:00:00Z&\
    to=2026-03-31T23:59:59Z&\
    page=${page}&\
    page_size=100" \
    -H "Authorization: Bearer $M2M_TOKEN" >> audit_q1_2026.jsonl
done
```

**场景：员工离职后追溯该员工所有被代理操作**
```bash
curl "http://your-host:4001/api/winamz/audit?\
  user_id=departing-employee-id&\
  event_type=agent_action&\
  page_size=100" \
  -H "Authorization: Bearer $M2M_TOKEN"
```
