# Integration Overview

WinAMZ provides two integration scenarios for downstream applications:

| Scenario | Your Application Type | Integration Method |
|----------|-----------------------|--------------------|
| Act on behalf of employee | Any service needing employee identity | Verify personal agent token (check `act` claim) |
| Act on behalf of enterprise | Backend services, data pipelines | Standard M2M + org token |

## Quick Start

### Scenario 1: Personal Agent (OpenClaw Model)

Your downstream application needs to:
1. Accept tokens from WinAMZ OIDC (`http://localhost:4001`)
2. Check the `act` claim to identify if it's an agent acting on behalf of a user
3. Record agent actions in audit logs

→ See [personal-agent.md](./personal-agent.md) for details

### Scenario 2: Enterprise Agent

Your downstream application needs to:
1. Accept M2M tokens with `org_id` claim
2. Verify the agent has appropriate scopes
3. No `act` claim — the agent acts as itself

→ See [org-agent.md](./org-agent.md) for details

## Token Structure Comparison

| Token Type | `sub` | `act.sub` | `org_id` | Who is acting? |
|------------|-------|-----------|----------|----------------|
| User direct | userId | (absent) | orgId | Employee themselves |
| Personal Agent | userId | agentId | orgId | Agent acting as employee |
| Enterprise Agent | agentAppId | (absent) | orgId | Enterprise agent as itself |

## WinAMZ Service Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| OIDC | `http://localhost:4001` | Token issuance, JWKS |
| Admin Console | `http://localhost:4002` | Agent registration, management |
| Management API | `http://localhost:4001/api` | WinAMZ APIs (agent CRUD, kill switch, audit) |
