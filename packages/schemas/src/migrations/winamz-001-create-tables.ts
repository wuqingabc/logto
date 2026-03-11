/**
 * WinAMZ initial migration: create winamz_agents, winamz_agent_grants, winamz_audit_logs tables.
 *
 * [winamz] This is a WinAMZ-specific migration file.
 * It does not modify any existing Logto tables.
 */

export const up = `
  CREATE TABLE IF NOT EXISTS winamz_agents (
    id             VARCHAR(21)  PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    type           VARCHAR(20)  NOT NULL CHECK (type IN ('personal', 'org')),
    org_id         VARCHAR(21)  NOT NULL,
    owner_user_id  VARCHAR(21),
    logto_app_id   VARCHAR(21),
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review', 'approved', 'rejected', 'suspended')),
    requested_scopes TEXT[]     NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS winamz_agents_org_id ON winamz_agents (org_id);
  CREATE INDEX IF NOT EXISTS winamz_agents_owner_user_id ON winamz_agents (owner_user_id);
  CREATE INDEX IF NOT EXISTS winamz_agents_status ON winamz_agents (status);

  CREATE TABLE IF NOT EXISTS winamz_agent_grants (
    id             VARCHAR(21)  PRIMARY KEY,
    agent_id       VARCHAR(21)  NOT NULL REFERENCES winamz_agents(id) ON DELETE CASCADE,
    user_id        VARCHAR(21)  NOT NULL,
    org_id         VARCHAR(21)  NOT NULL,
    granted_scopes TEXT[]       NOT NULL DEFAULT '{}',
    granted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,
    revoked_by     VARCHAR(21)
  );

  CREATE INDEX IF NOT EXISTS winamz_agent_grants_agent_id ON winamz_agent_grants (agent_id);
  CREATE INDEX IF NOT EXISTS winamz_agent_grants_user_id ON winamz_agent_grants (user_id);
  CREATE INDEX IF NOT EXISTS winamz_agent_grants_org_id ON winamz_agent_grants (org_id);

  CREATE TABLE IF NOT EXISTS winamz_audit_logs (
    id          VARCHAR(21)  PRIMARY KEY,
    event_type  VARCHAR(50)  NOT NULL,
    org_id      VARCHAR(21),
    agent_id    VARCHAR(21),
    user_id     VARCHAR(21),
    actor_id    VARCHAR(21),
    resource    TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS winamz_audit_logs_agent_id ON winamz_audit_logs (agent_id);
  CREATE INDEX IF NOT EXISTS winamz_audit_logs_user_id ON winamz_audit_logs (user_id);
  CREATE INDEX IF NOT EXISTS winamz_audit_logs_org_id ON winamz_audit_logs (org_id);
  CREATE INDEX IF NOT EXISTS winamz_audit_logs_created_at ON winamz_audit_logs (created_at DESC);
`;

export const down = `
  DROP TABLE IF EXISTS winamz_audit_logs;
  DROP TABLE IF EXISTS winamz_agent_grants;
  DROP TABLE IF EXISTS winamz_agents;
`;
