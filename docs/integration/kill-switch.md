# Kill Switch API Reference

## Revoke Personal Agent Authorization

```bash
# Admin invokes Kill Switch (takes effect immediately)
curl -X POST http://localhost:4001/api/winamz/grants/{grantId}/revoke \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Employee resignation" }'
```

**Effects:**
1. `winamz_agent_grants.revoked_at` is set
2. All Logto Grants for that user on that Client are deleted
3. Agent's Refresh Token is invalidated, cannot renew
4. Existing Access Tokens remain valid until expiry (default 1 hour)
   → For immediate invalidation, also call the suspend endpoint

**Response:**
```json
{
  "success": true,
  "revokedAt": "2026-03-11T09:30:00Z",
  "reason": "Employee resignation"
}
```

---

## Immediately Suspend Agent Account

```bash
# Suspend personal agent
curl -X POST http://localhost:4001/api/winamz/agents/{agentId}/suspend \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN"
```

**Effects:**
- For personal agents: Logto user account set to `isSuspended=true`, all tokens immediately invalid
- For org agents: Logto M2M application secret revoked, cannot obtain new tokens

**Response:**
```json
{
  "success": true,
  "agentId": "agent-id",
  "status": "suspended",
  "suspendedAt": "2026-03-11T09:30:00Z"
}
```

---

## Restore Agent

```bash
# Restore a previously suspended agent
curl -X POST http://localhost:4001/api/winamz/agents/{agentId}/restore \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN"
```

---

## Emergency Batch Operations

### Revoke all agents for an organization

```bash
# Revoke all agents under an organization (emergency use)
curl -X POST http://localhost:4001/api/winamz/agents/emergency-revoke \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "org_id": "your-org-id", "reason": "Security incident" }'
```

### Revoke all agents for a user

```bash
# Revoke all agent authorizations for a specific user
curl -X POST http://localhost:4001/api/winamz/grants/revoke-by-user \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "user_id": "user-id", "reason": "Account security review" }'
```

---

## Security Considerations

- All Kill Switch operations are recorded in `winamz_audit_logs`
- Admin operations require Management API M2M token authentication
- Recommend setting short `access_token` expiry (≤ 1 hour) to reduce residual risk window
- For high-sensitivity scenarios, consider setting `access_token` to ≤ 15 minutes
