# WinAMZ Identity & AI Agent Authorization Platform — PRD

## Product Name

**WinAMZ Identity & AI Agent Authorization Platform**
Based on Logto OSS Fork, focused on enterprise AI agent identity registration, delegated authorization, and security governance.

---

## Background

This platform addresses two fundamentally different authorization models for AI agents:

1. **Personal AI Agent (OpenClaw Model)**: Employee's AI persona acts on behalf of the employee. Requires user consent flow, actor token (RFC 8693), revocable delegation chain. Logto's existing M2M **does not** satisfy this scenario.

2. **Enterprise AI Assistant**: Organization-level AI represents the enterprise in handling data. Logto M2M + Organization Token **mostly satisfies** this scenario.

---

## Core Concept Model

```
Enterprise (Organization)
  ├── Employee (User)
  │     └── Personal AI Agent
  │           - Employee authorizes → actor token (RFC 8693)
  │           - Token: { sub: userId, act: { sub: agentId }, scope: "..." }
  │           - Employee or admin can revoke at any time
  │
  └── Enterprise AI Assistant (Org Agent)
        - Admin approval required
        - M2M token + org_id scope
        - Token: { sub: agentAppId, org_id: orgId, scope: "..." }
```

---

## Feature Modules

### F1: AI Agent Registry

**DB Table: `winamz_agents`**
```sql
CREATE TABLE winamz_agents (
  id             VARCHAR(21) PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  type           VARCHAR(20)  NOT NULL CHECK (type IN ('personal', 'org')),
  org_id         VARCHAR(21)  NOT NULL REFERENCES organizations(id),
  owner_user_id  VARCHAR(21)  REFERENCES users(id),
  logto_app_id   VARCHAR(21),
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending_review',
  requested_scopes TEXT[],
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

**Status Flow**: `pending_review` → `approved` / `rejected` → `suspended`

### F2: Personal Agent Delegation Flow

**DB Table: `winamz_agent_grants`**
```sql
CREATE TABLE winamz_agent_grants (
  id             VARCHAR(21) PRIMARY KEY,
  agent_id       VARCHAR(21) NOT NULL REFERENCES winamz_agents(id),
  user_id        VARCHAR(21) NOT NULL REFERENCES users(id),
  org_id         VARCHAR(21) NOT NULL REFERENCES organizations(id),
  granted_scopes TEXT[]      NOT NULL,
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_by     VARCHAR(21)
);
```

Token `act` claim injected via Logto JWT Customizer (zero intrusion to core code):
```javascript
const getCustomJwtClaims = async ({ token, context }) => {
  if (context.winamzAgentGrant) {
    return { act: { sub: context.winamzAgentGrant.agentId } };
  }
  return {};
};
```

### F3: Kill Switch

- **Personal Agent**: Update `winamz_agent_grants.revoked_at` + delete Logto Grant
- **Enterprise Agent**: Update `winamz_agents.status='suspended'` + revoke M2M Secret

### F4: Audit Log

**DB Table: `winamz_audit_logs`**
```sql
CREATE TABLE winamz_audit_logs (
  id          VARCHAR(21) PRIMARY KEY,
  event_type  VARCHAR(50) NOT NULL,
  org_id      VARCHAR(21),
  agent_id    VARCHAR(21),
  user_id     VARCHAR(21),
  actor_id    VARCHAR(21),
  resource    TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### F5: Admin UI (Extended Logto Console)

New "AI Agents" navigation section in Admin Console with three pages:
- `/winamz/agents` — Agent registry (approve/suspend)
- `/winamz/grants` — Delegation authorization list (Kill Switch)
- `/winamz/audit`  — Audit log query

---

## Technical Roadmap

| Phase | Task | Deliverable |
|-------|------|-------------|
| P0 | Fork + local dev environment | Running Logto fork |
| P1 | WinAMZ DB migration + `/api/winamz/agents` CRUD | Agent registry API |
| P2 | Personal delegation flow + JWT Customizer `act` claim | Complete delegation authorization flow |
| P3 | Kill Switch API + audit log | Security governance capability |
| P4 | Console UI (three admin pages) | Visual management console |
| P5 | Integration docs + OpenClaw validation | Developer docs + end-to-end validation |

---

## API Reference

### Agent Registry API

```
GET    /api/winamz/agents              List all agents (paginated)
POST   /api/winamz/agents              Register new agent
GET    /api/winamz/agents/:id          Get agent details
PATCH  /api/winamz/agents/:id          Update agent
DELETE /api/winamz/agents/:id          Delete agent
POST   /api/winamz/agents/:id/approve  Approve agent registration
POST   /api/winamz/agents/:id/suspend  Suspend agent
```

### Delegation Management API

```
GET    /api/winamz/grants              List all grants
POST   /api/winamz/grants              Create grant
GET    /api/winamz/grants/:id          Get grant details
POST   /api/winamz/grants/:id/revoke   Revoke grant (Kill Switch)
```

### Audit Log API

```
GET    /api/winamz/audit               Query audit logs (paginated, filterable)
POST   /api/winamz/audit               Record audit event
```

---

## Configuration

```bash
# Database
DATABASE_URL=postgresql://root:820518wU@localhost:5432/logto

# Ports
OIDC_PORT=4001
ADMIN_PORT=4002
```
