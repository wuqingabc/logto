# Enterprise Agent Integration Guide

## Scenario Description

The enterprise's data analysis AI needs to periodically read data from all departments without being bound to any specific employee.

---

## Step 1: Register Enterprise Agent

```bash
# Call WinAMZ API to create org type agent
curl -X POST http://localhost:4001/api/winamz/agents \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DataPipeline-v1",
    "type": "org",
    "org_id": "your-org-id",
    "requested_scopes": ["erp:read", "crm:read"]
  }'
# Returns agent_id, wait for admin to approve in Console
```

---

## Step 2: Admin Approves in Console

1. Open WinAMZ Admin Console: `http://localhost:4002`
2. Navigate to **AI Agents** → **Agents**
3. Find the pending agent, review requested scopes
4. Click **Approve** to create associated Logto M2M application
5. Console displays generated `client_id` and `client_secret` — save these securely

---

## Step 3: Get M2M Token After Approval

```javascript
// Enterprise agent uses Client Credentials to get token
const response = await fetch('http://localhost:4001/oidc/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: agentLogtoAppId,
    client_secret: agentLogtoAppSecret,
    resource: 'https://erp.winamz.com',
    organization_id: orgId,
    scope: 'erp:read crm:read',
  }),
});
const { access_token } = await response.json();
// token.sub = agentLogtoAppId (no act claim)
// token.org_id = orgId
```

---

## Step 4: Your Application Verifies the Token

```javascript
async function verifyOrgAgentToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'http://localhost:4001/oidc',
    audience: 'https://erp.winamz.com',
  });

  // Enterprise agent: no act claim, sub is the agent application ID
  req.agentAppId = payload.sub;
  req.orgId = payload.org_id;
  req.isOrgAgent = !payload.act && payload.org_id !== undefined;

  next();
}
```

---

## Kill Switch: Suspending Enterprise Agent

If the enterprise agent needs to be immediately stopped:

```bash
# Via WinAMZ Admin Console: AI Agents → Agents → Suspend
# Or via API:
curl -X POST http://localhost:4001/api/winamz/agents/{agentId}/suspend \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Effect:
1. `winamz_agents.status` is set to `suspended`
2. Associated Logto M2M application secret is revoked
3. Agent can no longer obtain new tokens
4. Existing access tokens expire within 1 hour

---

## Complete Use Case: Data Analysis AI Reads ERP Data

```
Sequence:
DataPipeline → WinAMZ Token Endpoint: POST /oidc/token (client_credentials)
WinAMZ → DataPipeline: Return M2M access_token
  token.sub = "datapipeline-app-id"
  token.org_id = "company-org-id"
  token.scope = "erp:read crm:read"

DataPipeline → ERP API: GET /reports/monthly
  Authorization: Bearer <token>

ERP API → ERP API: jwtVerify → req.agentAppId="datapipeline", req.orgId="company"
ERP API → DataPipeline: Return report data
```
