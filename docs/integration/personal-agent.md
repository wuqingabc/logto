# Personal Agent Integration Guide

## Scenario Description

Employee Zhang San uses OpenClaw and wants OpenClaw to call your application (e.g., ERP system, CRM) on their behalf.

---

## Step 1: Register Your API Resource in WinAMZ

In WinAMZ Admin Console (`http://localhost:4002`):
1. **API Resources** → Create → Enter your API Identifier (e.g., `https://erp.winamz.com`)
2. Create Scopes: `erp:read`, `erp:write`, `erp:admin`

---

## Step 2: OpenClaw Triggers Authorization Flow

```javascript
// OpenClaw initiates OAuth authorization request
const authUrl = new URL('http://localhost:4001/oidc/auth');
authUrl.searchParams.set('client_id', 'openclaw-app-id');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', 'openclaw://callback');
authUrl.searchParams.set('scope', 'openid erp:read erp:write');
authUrl.searchParams.set('resource', 'https://erp.winamz.com');
authUrl.searchParams.set('organization_id', orgId);
// Guide employee to complete authorization in browser...
```

The employee will see the WinAMZ consent page showing the specific permissions OpenClaw is requesting.

---

## Step 3: Your ERP Verifies the Token

```javascript
// ERP backend middleware
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('http://localhost:4001/oidc/jwks')
);

async function verifyAgentToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'http://localhost:4001/oidc',
    audience: 'https://erp.winamz.com',
  });

  // Standard user token: sub is employee ID
  // Agent token: sub is employee ID, act.sub is agent ID
  req.userId = payload.sub;
  req.agentId = payload.act?.sub ?? null;  // null means employee acted directly
  req.isAgent = !!payload.act;

  // Audit logs should record agentId
  next();
}
```

---

## Step 4: Audit Log Example

```javascript
// After each agent action, call WinAMZ audit API
await fetch('http://localhost:4001/api/winamz/audit', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${m2mToken}` },
  body: JSON.stringify({
    event_type: 'agent_action',
    agent_id: req.agentId,
    user_id: req.userId,
    resource: `erp:order:${orderId}`,
    metadata: { action: 'create', amount: 5000 }
  })
});
```

---

## Complete Use Case: OpenClaw Submits Purchase Order for Zhang San

```
Sequence:
OpenClaw → WinAMZ OIDC: Initiate authorization (scope: erp:write)
WinAMZ OIDC → Zhang San: Show consent page
Zhang San → WinAMZ OIDC: Click agree
WinAMZ OIDC → OpenClaw: Return access_token
  token.sub = "zhangsan-userId"
  token.act.sub = "openclaw-agent-id"
  token.scope = "erp:write"

OpenClaw → ERP API: POST /purchase-orders
  Authorization: Bearer <token>

ERP API → ERP API: jwtVerify → req.userId="zhangsan", req.agentId="openclaw"
ERP API → WinAMZ Audit API: Record "openclaw submitted purchase order on behalf of zhangsan"
ERP API → OpenClaw: 201 Created
```

---

## Kill Switch: Revoking Agent Authorization

If the employee wants to revoke OpenClaw's authorization at any time, or an administrator needs to do so:

```bash
# Via WinAMZ Admin Console: AI Agents → Grants → Revoke
# Or via API:
curl -X POST http://localhost:4001/api/winamz/grants/{grantId}/revoke \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{ "reason": "Employee request" }'
```

Effect: OpenClaw's refresh token is invalidated immediately. Existing access tokens expire within 1 hour (configurable).
