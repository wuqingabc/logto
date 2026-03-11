/**
 * WinAMZ Agent Grants routes.
 * Manages delegation grants between agents and users.
 * Provides Kill Switch (revoke) capability.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { generateStandardId } from '@logto/shared';
import { sql } from '@silverhand/slonik';
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

type GrantRow = {
  id: string;
  agentId: string;
  userId: string;
  orgId: string;
  grantedScopes: string[];
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
};

const toResponse = (row: GrantRow) => ({
  ...row,
  grantedAt: new Date(row.grantedAt).toISOString(),
  expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
  revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
});

const grantSelectCols = sql`
  id,
  agent_id as "agentId",
  user_id as "userId",
  org_id as "orgId",
  granted_scopes as "grantedScopes",
  granted_at as "grantedAt",
  expires_at as "expiresAt",
  revoked_at as "revokedAt",
  revoked_by as "revokedBy"
`;

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
      response: grantResponseGuard.array(),
      status: [200],
    }),
    async (ctx, next) => {
      const { limit, offset } = ctx.pagination;
      const { agentId, userId, orgId, active } = ctx.guard.query;

      const conditions = [
        agentId && sql`agent_id = ${agentId}`,
        userId && sql`user_id = ${userId}`,
        orgId && sql`org_id = ${orgId}`,
        active === 'true' &&
          sql`revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
        active === 'false' &&
          sql`(revoked_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at <= NOW()))`,
      ].filter(Boolean);

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      const [{ count }, rows] = await Promise.all([
        pool.one<{ count: string }>(
          sql`SELECT COUNT(*) as count FROM winamz_agent_grants ${whereClause}`
        ),
        pool.any<GrantRow>(
          sql`SELECT ${grantSelectCols}
              FROM winamz_agent_grants ${whereClause}
              ORDER BY granted_at DESC
              LIMIT ${limit} OFFSET ${offset}`
        ),
      ]);

      ctx.pagination.totalCount = Number(count);
      ctx.body = rows.map(toResponse);
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

      const row = await pool.maybeOne<GrantRow>(
        sql`SELECT ${grantSelectCols} FROM winamz_agent_grants WHERE id = ${id}`
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = toResponse(row);
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

      const row = await pool.one<GrantRow>(
        sql`INSERT INTO winamz_agent_grants
              (id, agent_id, user_id, org_id, granted_scopes, expires_at)
            VALUES (
              ${id}, ${agentId}, ${userId}, ${orgId},
              ${sql.array(grantedScopes, 'text')},
              ${expiresAt ?? null}
            )
            RETURNING ${grantSelectCols}`
      );

      await pool.query(
        sql`INSERT INTO winamz_audit_logs
              (id, event_type, agent_id, user_id, org_id, created_at)
            VALUES (${generateStandardId()}, 'grant_created', ${agentId}, ${userId}, ${orgId}, NOW())`
      );

      ctx.status = 201;
      ctx.body = toResponse(row);
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

      const row = await pool.maybeOne<{ id: string; agentId: string; userId: string; orgId: string }>(
        sql`UPDATE winamz_agent_grants
            SET revoked_at = ${now.toISOString()}, revoked_by = ${revokedBy ?? null}
            WHERE id = ${id} AND revoked_at IS NULL
            RETURNING id, agent_id as "agentId", user_id as "userId", org_id as "orgId"`
      );

      if (!row) {
        const existing = await pool.maybeOne<{ id: string }>(
          sql`SELECT id FROM winamz_agent_grants WHERE id = ${id}`
        );
        ctx.status = existing ? 422 : 404;
        return next();
      }

      await pool.query(
        sql`INSERT INTO winamz_audit_logs
              (id, event_type, agent_id, user_id, org_id, actor_id, metadata, created_at)
            VALUES (
              ${generateStandardId()}, 'grant_revoked',
              ${row.agentId}, ${row.userId}, ${row.orgId},
              ${revokedBy ?? null},
              ${reason ? JSON.stringify({ reason }) : null},
              NOW()
            )`
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

      const rows = await pool.any<{ id: string; agentId: string; orgId: string }>(
        sql`UPDATE winamz_agent_grants
            SET revoked_at = ${now.toISOString()}, revoked_by = ${revokedBy ?? null}
            WHERE user_id = ${userId} AND revoked_at IS NULL
            RETURNING id, agent_id as "agentId", org_id as "orgId"`
      );

      await Promise.all(
        rows.map((row) =>
          pool.query(
            sql`INSERT INTO winamz_audit_logs
                  (id, event_type, agent_id, user_id, org_id, actor_id, metadata, created_at)
                VALUES (
                  ${generateStandardId()}, 'grant_revoked',
                  ${row.agentId}, ${userId}, ${row.orgId},
                  ${revokedBy ?? null},
                  ${JSON.stringify({ reason: reason ?? null, batch: true })},
                  NOW()
                )`
          )
        )
      );

      ctx.body = { revokedCount: rows.length };
      return next();
    }
  );
}
