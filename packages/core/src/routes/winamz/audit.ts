/**
 * WinAMZ Audit Log routes.
 * Provides read and write access to winamz_audit_logs table.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { generateStandardId } from '@logto/shared';
import { sql } from '@silverhand/slonik';
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

type AuditRow = {
  id: string;
  eventType: string;
  orgId: string | null;
  agentId: string | null;
  userId: string | null;
  actorId: string | null;
  resource: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

const auditSelectCols = sql`
  id,
  event_type as "eventType",
  org_id as "orgId",
  agent_id as "agentId",
  user_id as "userId",
  actor_id as "actorId",
  resource,
  metadata,
  created_at as "createdAt"
`;

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
      response: auditLogResponseGuard.array(),
      status: [200],
    }),
    async (ctx, next) => {
      const { limit, offset } = ctx.pagination;
      const { agentId, userId, orgId, eventType, from, to } = ctx.guard.query;

      const conditions = [
        agentId && sql`agent_id = ${agentId}`,
        userId && sql`user_id = ${userId}`,
        orgId && sql`org_id = ${orgId}`,
        eventType && sql`event_type = ${eventType}`,
        from && sql`created_at >= ${from}`,
        to && sql`created_at <= ${to}`,
      ].filter(Boolean);

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      const [{ count }, rows] = await Promise.all([
        pool.one<{ count: string }>(
          sql`SELECT COUNT(*) as count FROM winamz_audit_logs ${whereClause}`
        ),
        pool.any<AuditRow>(
          sql`SELECT ${auditSelectCols}
              FROM winamz_audit_logs ${whereClause}
              ORDER BY created_at DESC
              LIMIT ${limit} OFFSET ${offset}`
        ),
      ]);

      ctx.pagination.totalCount = Number(count);
      ctx.body = rows.map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toISOString(),
      }));
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

      const row = await pool.one<AuditRow>(
        sql`INSERT INTO winamz_audit_logs
              (id, event_type, org_id, agent_id, user_id, actor_id, resource, metadata)
            VALUES (
              ${id}, ${eventType},
              ${orgId ?? null}, ${agentId ?? null}, ${userId ?? null},
              ${actorId ?? null}, ${resource ?? null},
              ${metadata ? JSON.stringify(metadata) : null}
            )
            RETURNING ${auditSelectCols}`
      );

      ctx.status = 201;
      ctx.body = { ...row, createdAt: new Date(row.createdAt).toISOString() };
      return next();
    }
  );
}
