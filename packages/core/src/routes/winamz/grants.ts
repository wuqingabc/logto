/**
 * WinAMZ Agent Grants routes.
 * Manages delegation grants between agents and users.
 * Provides Kill Switch (revoke) capability.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { generateStandardId } from '@logto/shared';
import { z } from 'zod';

import koaGuard from '#src/middleware/koa-guard.js';
import koaPagination from '#src/middleware/koa-pagination.js';

import type { ManagementApiRouter, RouterInitArgs } from '../types.js';

const grantResponseGuard = z.object({
  id: z.string(),
  agentId: z.string(),
  userId: z.string(),
  orgId: z.string(),
  grantedScopes: z.array(z.string()),
  grantedAt: z.string(),
  expiresAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  revokedBy: z.string().nullable().optional(),
});

export default function winamzGrantRoutes<T extends ManagementApiRouter>(
  ...[router, { queries }]: RouterInitArgs<T>
) {
  const { pool } = queries;

  // List grants
  router.get(
    '/winamz/grants',
    koaPagination(),
    koaGuard({
      query: z.object({
        agentId: z.string().optional(),
        userId: z.string().optional(),
        orgId: z.string().optional(),
        active: z.enum(['true', 'false']).optional(),
      }),
      response: z.object({ total: z.number(), items: grantResponseGuard.array() }),
      status: [200],
    }),
    async (ctx, next) => {
      const { limit, offset } = ctx.pagination;
      const { agentId, userId, orgId, active } = ctx.guard.query;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (agentId) {
        params.push(agentId);
        conditions.push(`agent_id = $${params.length}`);
      }
      if (userId) {
        params.push(userId);
        conditions.push(`user_id = $${params.length}`);
      }
      if (orgId) {
        params.push(orgId);
        conditions.push(`org_id = $${params.length}`);
      }
      if (active === 'true') {
        conditions.push(`revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`);
      } else if (active === 'false') {
        conditions.push(`(revoked_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at <= NOW()))`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.one<{ count: string }>(
        `SELECT COUNT(*) as count FROM winamz_agent_grants ${where}`,
        params
      );

      params.push(limit, offset);
      const rows = await pool.any(
        `SELECT id, agent_id as "agentId", user_id as "userId", org_id as "orgId",
                granted_scopes as "grantedScopes", granted_at as "grantedAt",
                expires_at as "expiresAt", revoked_at as "revokedAt", revoked_by as "revokedBy"
         FROM winamz_agent_grants ${where}
         ORDER BY granted_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      ctx.body = {
        total: Number(countResult.count),
        items: rows.map((row) => ({
          ...row,
          grantedAt: new Date(row.grantedAt as string).toISOString(),
          expiresAt: row.expiresAt ? new Date(row.expiresAt as string).toISOString() : null,
          revokedAt: row.revokedAt ? new Date(row.revokedAt as string).toISOString() : null,
        })),
      };

      return next();
    }
  );

  // Get grant by ID
  router.get(
    '/winamz/grants/:id',
    koaGuard({
      params: z.object({ id: z.string() }),
      response: grantResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;

      const row = await pool.maybeOne(
        `SELECT id, agent_id as "agentId", user_id as "userId", org_id as "orgId",
                granted_scopes as "grantedScopes", granted_at as "grantedAt",
                expires_at as "expiresAt", revoked_at as "revokedAt", revoked_by as "revokedBy"
         FROM winamz_agent_grants WHERE id = $1`,
        [id]
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = {
        ...row,
        grantedAt: new Date(row.grantedAt as string).toISOString(),
        expiresAt: row.expiresAt ? new Date(row.expiresAt as string).toISOString() : null,
        revokedAt: row.revokedAt ? new Date(row.revokedAt as string).toISOString() : null,
      };

      return next();
    }
  );

  // Create grant
  router.post(
    '/winamz/grants',
    koaGuard({
      body: z.object({
        agentId: z.string(),
        userId: z.string(),
        orgId: z.string(),
        grantedScopes: z.array(z.string()),
        expiresAt: z.string().optional(),
      }),
      response: grantResponseGuard,
      status: [201],
    }),
    async (ctx, next) => {
      const { agentId, userId, orgId, grantedScopes, expiresAt } = ctx.guard.body;
      const id = generateStandardId();

      const row = await pool.one(
        `INSERT INTO winamz_agent_grants
           (id, agent_id, user_id, org_id, granted_scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, agent_id as "agentId", user_id as "userId", org_id as "orgId",
                   granted_scopes as "grantedScopes", granted_at as "grantedAt",
                   expires_at as "expiresAt", revoked_at as "revokedAt", revoked_by as "revokedBy"`,
        [id, agentId, userId, orgId, grantedScopes, expiresAt ?? null]
      );

      // Audit log
      await pool.query(
        `INSERT INTO winamz_audit_logs (id, event_type, agent_id, user_id, org_id, created_at)
         VALUES ($1, 'grant_created', $2, $3, $4, NOW())`,
        [generateStandardId(), agentId, userId, orgId]
      );

      ctx.status = 201;
      ctx.body = {
        ...row,
        grantedAt: new Date(row.grantedAt as string).toISOString(),
        expiresAt: row.expiresAt ? new Date(row.expiresAt as string).toISOString() : null,
        revokedAt: null,
        revokedBy: null,
      };

      return next();
    }
  );

  // Revoke grant (Kill Switch)
  router.post(
    '/winamz/grants/:id/revoke',
    koaGuard({
      params: z.object({ id: z.string() }),
      body: z.object({
        revokedBy: z.string().optional(),
        reason: z.string().optional(),
      }),
      response: z.object({
        success: z.boolean(),
        revokedAt: z.string(),
        reason: z.string().optional(),
      }),
      status: [200, 404, 422],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;
      const { revokedBy, reason } = ctx.guard.body;
      const now = new Date();

      const row = await pool.maybeOne(
        `UPDATE winamz_agent_grants
         SET revoked_at = $2, revoked_by = $3
         WHERE id = $1 AND revoked_at IS NULL
         RETURNING id, agent_id as "agentId", user_id as "userId", org_id as "orgId"`,
        [id, now, revokedBy ?? null]
      );

      if (!row) {
        const existing = await pool.maybeOne(
          `SELECT id, revoked_at FROM winamz_agent_grants WHERE id = $1`,
          [id]
        );
        ctx.status = existing ? 422 : 404;
        return next();
      }

      // Audit log
      await pool.query(
        `INSERT INTO winamz_audit_logs
           (id, event_type, agent_id, user_id, org_id, actor_id, metadata, created_at)
         VALUES ($1, 'grant_revoked', $2, $3, $4, $5, $6, NOW())`,
        [
          generateStandardId(),
          row.agentId,
          row.userId,
          row.orgId,
          revokedBy ?? null,
          reason ? JSON.stringify({ reason }) : null,
        ]
      );

      ctx.body = {
        success: true,
        revokedAt: now.toISOString(),
        ...(reason && { reason }),
      };

      return next();
    }
  );

  // Revoke all grants for a user (batch Kill Switch)
  router.post(
    '/winamz/grants/revoke-by-user',
    koaGuard({
      body: z.object({
        userId: z.string(),
        revokedBy: z.string().optional(),
        reason: z.string().optional(),
      }),
      response: z.object({ revokedCount: z.number() }),
      status: [200],
    }),
    async (ctx, next) => {
      const { userId, revokedBy, reason } = ctx.guard.body;
      const now = new Date();

      const rows = await pool.any(
        `UPDATE winamz_agent_grants
         SET revoked_at = $2, revoked_by = $3
         WHERE user_id = $1 AND revoked_at IS NULL
         RETURNING id, agent_id as "agentId", org_id as "orgId"`,
        [userId, now, revokedBy ?? null]
      );

      // Audit logs for each revoked grant
      for (const row of rows) {
        await pool.query(
          `INSERT INTO winamz_audit_logs
             (id, event_type, agent_id, user_id, org_id, actor_id, metadata, created_at)
           VALUES ($1, 'grant_revoked', $2, $3, $4, $5, $6, NOW())`,
          [
            generateStandardId(),
            row.agentId,
            userId,
            row.orgId,
            revokedBy ?? null,
            reason ? JSON.stringify({ reason, batch: true }) : JSON.stringify({ batch: true }),
          ]
        );
      }

      ctx.body = { revokedCount: rows.length };

      return next();
    }
  );
}
