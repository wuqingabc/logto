# Audit Log API Reference

## Query Audit Logs

```bash
# Query all operations by a specific agent
GET /api/winamz/audit?agent_id={agentId}&from=2026-01-01&to=2026-12-31

# Query all agents that have acted on behalf of a specific user
GET /api/winamz/audit?user_id={userId}&event_type=agent_action

# Query all Kill Switch operations for an organization
GET /api/winamz/audit?org_id={orgId}&event_type=grant_revoked

# Pagination
GET /api/winamz/audit?page=1&page_size=20
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | string | Filter by agent ID |
| `user_id` | string | Filter by user ID |
| `org_id` | string | Filter by organization ID |
| `event_type` | string | Filter by event type |
| `from` | ISO 8601 date | Start time |
| `to` | ISO 8601 date | End time |
| `page` | number | Page number (default: 1) |
| `page_size` | number | Page size (default: 20, max: 100) |

**Response Example:**
```json
{
  "total": 42,
  "data": [
    {
      "id": "abc123",
      "event_type": "agent_action",
      "agent_id": "openclaw-agent-id",
      "agent_name": "OpenClaw v2.1",
      "user_id": "zhangsan-user-id",
      "user_name": "Zhang San",
      "org_id": "company-org-id",
      "resource": "erp:order:PO-2026-001",
      "metadata": { "action": "create", "amount": 5000 },
      "created_at": "2026-03-11T09:30:00Z"
    }
  ]
}
```

---

## Record Audit Event

Downstream applications should call this API after each agent operation to record the event.

```bash
POST /api/winamz/audit
Authorization: Bearer $M2M_TOKEN
Content-Type: application/json

{
  "event_type": "agent_action",
  "agent_id": "openclaw-agent-id",
  "user_id": "zhangsan-user-id",
  "org_id": "company-org-id",
  "resource": "erp:order:PO-2026-001",
  "metadata": {
    "action": "create",
    "method": "POST",
    "path": "/purchase-orders",
    "amount": 5000,
    "status_code": 201
  }
}
```

---

## Event Types

| Event Type | Description | Key Fields |
|------------|-------------|------------|
| `agent_registered` | New agent registered | `agent_id`, `org_id` |
| `agent_approved` | Agent approved by admin | `agent_id`, `actor_id` |
| `agent_suspended` | Agent suspended | `agent_id`, `actor_id` |
| `grant_created` | User authorized agent | `agent_id`, `user_id` |
| `grant_revoked` | Agent authorization revoked | `agent_id`, `user_id`, `actor_id` |
| `agent_action` | Agent performed operation on behalf of user | `agent_id`, `user_id`, `resource` |
| `token_issued` | Token issued to agent | `agent_id` |

---

## Downstream Application Integration Example

```javascript
// Audit log middleware — runs after request completes
app.use(async (req, res, next) => {
  await next();

  if (req.isAgent && req.agentId) {
    // Non-blocking audit log recording
    fetch('http://localhost:4001/api/winamz/audit', {
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
        },
      }),
    }).catch(console.error); // Don't let audit log failure affect business
  }
});
```
