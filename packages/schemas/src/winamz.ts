/**
 * WinAMZ type definitions.
 * All types related to AI agent registry, delegation grants, and audit logs.
 */

export type WinamzAgentType = 'personal' | 'org';

export type WinamzAgentStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type WinamzAgent = {
  id: string;
  name: string;
  type: WinamzAgentType;
  orgId: string;
  ownerUserId?: string;
  logtoAppId?: string;
  status: WinamzAgentStatus;
  requestedScopes: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type WinamzAgentGrant = {
  id: string;
  agentId: string;
  userId: string;
  orgId: string;
  grantedScopes: string[];
  grantedAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  revokedBy?: string;
};

export type WinamzAuditEventType =
  | 'agent_registered'
  | 'agent_approved'
  | 'agent_suspended'
  | 'grant_created'
  | 'grant_revoked'
  | 'agent_action'
  | 'token_issued';

export type WinamzAuditLog = {
  id: string;
  eventType: WinamzAuditEventType;
  orgId?: string;
  agentId?: string;
  userId?: string;
  actorId?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};
