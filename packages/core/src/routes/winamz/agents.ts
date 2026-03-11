/**
 * WinAMZ Agent Registry routes.
 * Handles CRUD operations for AI agents and approval/suspension lifecycle.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { generateStandardId } from '@logto/shared';
import { sql } from '@silverhand/slonik';
import { z } from 'zod';

import koaGuard from '#src/middleware/koa-guard.js';
import koaPagination from '#src/middleware/koa-pagination.js';

import type { ManagementApiRouter, RouterInitArgs } from '../types.js';

const agentCreateGuard = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['personal', 'org']),
  orgId: z.string().min(1),
  ownerUserId: z.string().optional(),
  requestedScopes: z.array(z.string()).optional().default([]),
});

const agentPatchGuard = z.object({
  name: z.string().min(1).max(255).optional(),
  requestedScopes: z.array(z.string()).optional(),
});

const agentResponseGuard = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['personal', 'org']),
  orgId: z.string(),
  ownerUserId: z.string().optional().nullable(),
  logtoAppId: z.string().optional().nullable(),
  status: z.enum(['pending_review', 'approved', 'rejected', 'suspended']),
  requestedScopes: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type AgentRow = {
  id: string;
  name: string;
  type: 'personal' | 'org';
  orgId: string;
  ownerUserId: string | null;
  logtoAppId: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'suspended';
  requestedScopes: string[];
  createdAt: Date;
  updatedAt: Date;
};

const toResponse = (row: AgentRow) => ({
  ...row,
  createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString(),
});

export default function winamzAgentRoutes<T extends ManagementApiRouter>(
  ...[router, { queries }]: RouterInitArgs<T>
) {
  const { pool } = queries;

  // List agents
  router.get(
    '/winamz/agents',
    koaPagination(),
    koaGuard({
      query: z.object({
        orgId: z.string().optional(),
        status: z.enum(['pending_review', 'approved', 'rejected', 'suspended']).optional(),
        type: z.enum(['personal', 'org']).optional(),
      }),
      response: agentResponseGuard.array(),
      status: [200],
    }),
    async (ctx, next) => {
      const { limit, offset } = ctx.pagination;
      const { orgId, status, type } = ctx.guard.query;

      const conditions = [
        orgId && sql`org_id = ${orgId}`,
        status && sql`status = ${status}`,
        type && sql`type = ${type}`,
      ].filter(Boolean);

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      const [{ count }, rows] = await Promise.all([
        pool.one<{ count: string }>(
          sql`SELECT COUNT(*) as count FROM winamz_agents ${whereClause}`
        ),
        pool.any<AgentRow>(
          sql`SELECT id, name, type,
                     org_id as "orgId",
                     owner_user_id as "ownerUserId",
                     logto_app_id as "logtoAppId",
                     status,
                     requested_scopes as "requestedScopes",
                     created_at as "createdAt",
                     updated_at as "updatedAt"
              FROM winamz_agents ${whereClause}
              ORDER BY created_at DESC
              LIMIT ${limit} OFFSET ${offset}`
        ),
      ]);

      ctx.pagination.totalCount = Number(count);
      ctx.body = rows.map(toResponse);
      return next();
    }
  );

  // Get agent by ID
  router.get(
    '/winamz/agents/:id',
    koaGuard({
      params: z.object({ id: z.string() }),
      response: agentResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;

      const row = await pool.maybeOne<AgentRow>(
        sql`SELECT id, name, type,
                   org_id as "orgId",
                   owner_user_id as "ownerUserId",
                   logto_app_id as "logtoAppId",
                   status,
                   requested_scopes as "requestedScopes",
                   created_at as "createdAt",
                   updated_at as "updatedAt"
            FROM winamz_agents WHERE id = ${id}`
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = toResponse(row);
      return next();
    }
  );

  // Create agent
  router.post(
    '/winamz/agents',
    koaGuard({
      body: agentCreateGuard,
      response: agentResponseGuard,
      status: [201],
    }),
    async (ctx, next) => {
      const { name, type, orgId, ownerUserId, requestedScopes } = ctx.guard.body;
      const id = generateStandardId();
      const now = new Date();

      const row = await pool.one<AgentRow>(
        sql`INSERT INTO winamz_agents
              (id, name, type, org_id, owner_user_id, requested_scopes, created_at, updated_at)
            VALUES (
              ${id}, ${name}, ${type}, ${orgId},
              ${ownerUserId ?? null},
              ${sql.array(requestedScopes, 'text')},
              ${now.toISOString()}, ${now.toISOString()}
            )
            RETURNING id, name, type,
                      org_id as "orgId",
                      owner_user_id as "ownerUserId",
                      logto_app_id as "logtoAppId",
                      status,
                      requested_scopes as "requestedScopes",
                      created_at as "createdAt",
                      updated_at as "updatedAt"`
      );

      ctx.status = 201;
      ctx.body = toResponse(row);
      return next();
    }
  );

  // Update agent
  router.patch(
    '/winamz/agents/:id',
    koaGuard({
      params: z.object({ id: z.string() }),
      body: agentPatchGuard,
      response: agentResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;
      const { name, requestedScopes } = ctx.guard.body;

      const setClauses = [
        sql`updated_at = NOW()`,
        name !== undefined && sql`name = ${name}`,
        requestedScopes !== undefined &&
          sql`requested_scopes = ${sql.array(requestedScopes, 'text')}`,
      ].filter(Boolean);

      const row = await pool.maybeOne<AgentRow>(
        sql`UPDATE winamz_agents
            SET ${sql.join(setClauses, sql`, `)}
            WHERE id = ${id}
            RETURNING id, name, type,
                      org_id as "orgId",
                      owner_user_id as "ownerUserId",
                      logto_app_id as "logtoAppId",
                      status,
                      requested_scopes as "requestedScopes",
                      created_at as "createdAt",
                      updated_at as "updatedAt"`
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = toResponse(row);
      return next();
    }
  );

  // Delete agent
  router.delete(
    '/winamz/agents/:id',
    koaGuard({
      params: z.object({ id: z.string() }),
      status: [204, 404],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;

      const result = await pool.maybeOne<{ id: string }>(
        sql`DELETE FROM winamz_agents WHERE id = ${id} RETURNING id`
      );

      ctx.status = result ? 204 : 404;
      return next();
    }
  );

  // Approve agent
  router.post(
    '/winamz/agents/:id/approve',
    koaGuard({
      params: z.object({ id: z.string() }),
      response: agentResponseGuard,
      status: [200, 404, 422],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;

      const row = await pool.maybeOne<AgentRow>(
        sql`UPDATE winamz_agents
            SET status = 'approved', updated_at = NOW()
            WHERE id = ${id} AND status = 'pending_review'
            RETURNING id, name, type,
                      org_id as "orgId",
                      owner_user_id as "ownerUserId",
                      logto_app_id as "logtoAppId",
                      status,
                      requested_scopes as "requestedScopes",
                      created_at as "createdAt",
                      updated_at as "updatedAt"`
      );

      if (!row) {
        const existing = await pool.maybeOne<{ id: string }>(
          sql`SELECT id FROM winamz_agents WHERE id = ${id}`
        );
        ctx.status = existing ? 422 : 404;
        return next();
      }

      ctx.body = toResponse(row);
      return next();
    }
  );

  // Suspend agent
  router.post(
    '/winamz/agents/:id/suspend',
    koaGuard({
      params: z.object({ id: z.string() }),
      response: agentResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;

      const row = await pool.maybeOne<AgentRow>(
        sql`UPDATE winamz_agents
            SET status = 'suspended', updated_at = NOW()
            WHERE id = ${id}
            RETURNING id, name, type,
                      org_id as "orgId",
                      owner_user_id as "ownerUserId",
                      logto_app_id as "logtoAppId",
                      status,
                      requested_scopes as "requestedScopes",
                      created_at as "createdAt",
                      updated_at as "updatedAt"`
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      await pool.query(
        sql`INSERT INTO winamz_audit_logs (id, event_type, agent_id, org_id, created_at)
            VALUES (${generateStandardId()}, 'agent_suspended', ${id}, ${row.orgId}, NOW())`
      );

      ctx.body = toResponse(row);
      return next();
    }
  );

  // Restore agent
  router.post(
    '/winamz/agents/:id/restore',
    koaGuard({
      params: z.object({ id: z.string() }),
      response: agentResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      const { id } = ctx.guard.params;

      const row = await pool.maybeOne<AgentRow>(
        sql`UPDATE winamz_agents
            SET status = 'approved', updated_at = NOW()
            WHERE id = ${id} AND status = 'suspended'
            RETURNING id, name, type,
                      org_id as "orgId",
                      owner_user_id as "ownerUserId",
                      logto_app_id as "logtoAppId",
                      status,
                      requested_scopes as "requestedScopes",
                      created_at as "createdAt",
                      updated_at as "updatedAt"`
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = toResponse(row);
      return next();
    }
  );
}
