/**
 * WinAMZ Audit Log routes.
 * Provides read and write access to winamz_audit_logs table.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { generateStandardId } from '@logto/shared';
import { z } from 'zod';

import koaGuard from '#src/middleware/koa-guard.js';
import koaPagination from '#src/middleware/koa-pagination.js';

import type { ManagementApiRouter, RouterInitArgs } from '../types.js';

const auditLogResponseGuard = z.object({
  id: z.string(),
  eventType: z.string(),
  orgId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  actorId: z.string().nullable().optional(),
  resource: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
});

export default function winamzAuditRoutes<T extends ManagementApiRouter>(
  ...[router, { queries }]: RouterInitArgs<T>
) {
  const { pool } = queries;

  // Query audit logs
  router.get(
    '/winamz/audit',
    koaPagination(),
    koaGuard({
      query: z.object({
        agentId: z.string().optional(),
        userId: z.string().optional(),
        orgId: z.string().optional(),
        eventType: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
      response: z.object({
        total: z.number(),
        data: auditLogResponseGuard.array(),
      }),
      status: [200],
    }),
    async (ctx, next) => {
      const { limit, offset } = ctx.pagination;
      const { agentId, userId, orgId, eventType, from, to } = ctx.guard.query;

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
      if (eventType) {
        params.push(eventType);
        conditions.push(`event_type = $${params.length}`);
      }
      if (from) {
        params.push(new Date(from));
        conditions.push(`created_at >= $${params.length}`);
      }
      if (to) {
        params.push(new Date(to));
        conditions.push(`created_at <= $${params.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.one<{ count: string }>(
        `SELECT COUNT(*) as count FROM winamz_audit_logs ${where}`,
        params
      );

      params.push(limit, offset);
      const rows = await pool.any(
        `SELECT id, event_type as "eventType", org_id as "orgId", agent_id as "agentId",
                user_id as "userId", actor_id as "actorId", resource, metadata,
                created_at as "createdAt"
         FROM winamz_audit_logs ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      ctx.body = {
        total: Number(countResult.count),
        data: rows.map((row) => ({
          ...row,
          createdAt: new Date(row.createdAt as string).toISOString(),
        })),
      };

      return next();
    }
  );

  // Record audit event
  router.post(
    '/winamz/audit',
    koaGuard({
      body: z.object({
        eventType: z.string(),
        orgId: z.string().optional(),
        agentId: z.string().optional(),
        userId: z.string().optional(),
        actorId: z.string().optional(),
        resource: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
      response: auditLogResponseGuard,
      status: [201],
    }),
    async (ctx, next) => {
      const { eventType, orgId, agentId, userId, actorId, resource, metadata } = ctx.guard.body;
      const id = generateStandardId();

      const row = await pool.one(
        `INSERT INTO winamz_audit_logs
           (id, event_type, org_id, agent_id, user_id, actor_id, resource, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, event_type as "eventType", org_id as "orgId", agent_id as "agentId",
                   user_id as "userId", actor_id as "actorId", resource, metadata,
                   created_at as "createdAt"`,
        [
          id,
          eventType,
          orgId ?? null,
          agentId ?? null,
          userId ?? null,
          actorId ?? null,
          resource ?? null,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      ctx.status = 201;
      ctx.body = {
        ...row,
        createdAt: new Date(row.createdAt as string).toISOString(),
      };

      return next();
    }
  );
}
