/**
 * WinAMZ Agent Registry routes.
 * Handles CRUD operations for AI agents and approval/suspension lifecycle.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { generateStandardId } from '@logto/shared';
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
      response: z.object({ total: z.number(), items: agentResponseGuard.array() }),
      status: [200],
    }),
    async (ctx, next) => {
      const { limit, offset } = ctx.pagination;
      const { orgId, status, type } = ctx.guard.query;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (orgId) {
        params.push(orgId);
        conditions.push(`org_id = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (type) {
        params.push(type);
        conditions.push(`type = $${params.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.one<{ count: string }>(
        `SELECT COUNT(*) as count FROM winamz_agents ${where}`,
        params
      );

      params.push(limit, offset);
      const rows = await pool.any(
        `SELECT id, name, type, org_id as "orgId", owner_user_id as "ownerUserId",
                logto_app_id as "logtoAppId", status, requested_scopes as "requestedScopes",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM winamz_agents ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      ctx.body = {
        total: Number(countResult.count),
        items: rows.map((row) => ({
          ...row,
          createdAt: new Date(row.createdAt as string).toISOString(),
          updatedAt: new Date(row.updatedAt as string).toISOString(),
        })),
      };

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

      const row = await pool.maybeOne(
        `SELECT id, name, type, org_id as "orgId", owner_user_id as "ownerUserId",
                logto_app_id as "logtoAppId", status, requested_scopes as "requestedScopes",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM winamz_agents WHERE id = $1`,
        [id]
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = {
        ...row,
        createdAt: new Date(row.createdAt as string).toISOString(),
        updatedAt: new Date(row.updatedAt as string).toISOString(),
      };

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

      const row = await pool.one(
        `INSERT INTO winamz_agents
           (id, name, type, org_id, owner_user_id, requested_scopes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, type, org_id as "orgId", owner_user_id as "ownerUserId",
                   logto_app_id as "logtoAppId", status, requested_scopes as "requestedScopes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [id, name, type, orgId, ownerUserId ?? null, requestedScopes, now, now]
      );

      ctx.status = 201;
      ctx.body = {
        ...row,
        createdAt: new Date(row.createdAt as string).toISOString(),
        updatedAt: new Date(row.updatedAt as string).toISOString(),
      };

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
      const updates = ctx.guard.body;

      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [id];

      if (updates.name !== undefined) {
        params.push(updates.name);
        setClauses.push(`name = $${params.length}`);
      }
      if (updates.requestedScopes !== undefined) {
        params.push(updates.requestedScopes);
        setClauses.push(`requested_scopes = $${params.length}`);
      }

      const row = await pool.maybeOne(
        `UPDATE winamz_agents SET ${setClauses.join(', ')}
         WHERE id = $1
         RETURNING id, name, type, org_id as "orgId", owner_user_id as "ownerUserId",
                   logto_app_id as "logtoAppId", status, requested_scopes as "requestedScopes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        params
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = {
        ...row,
        createdAt: new Date(row.createdAt as string).toISOString(),
        updatedAt: new Date(row.updatedAt as string).toISOString(),
      };

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

      const result = await pool.maybeOne(
        `DELETE FROM winamz_agents WHERE id = $1 RETURNING id`,
        [id]
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

      const row = await pool.maybeOne(
        `UPDATE winamz_agents
         SET status = 'approved', updated_at = NOW()
         WHERE id = $1 AND status = 'pending_review'
         RETURNING id, name, type, org_id as "orgId", owner_user_id as "ownerUserId",
                   logto_app_id as "logtoAppId", status, requested_scopes as "requestedScopes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [id]
      );

      if (!row) {
        const existing = await pool.maybeOne(
          `SELECT id FROM winamz_agents WHERE id = $1`,
          [id]
        );
        ctx.status = existing ? 422 : 404;
        return next();
      }

      ctx.body = {
        ...row,
        createdAt: new Date(row.createdAt as string).toISOString(),
        updatedAt: new Date(row.updatedAt as string).toISOString(),
      };

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

      const row = await pool.maybeOne(
        `UPDATE winamz_agents
         SET status = 'suspended', updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, type, org_id as "orgId", owner_user_id as "ownerUserId",
                   logto_app_id as "logtoAppId", status, requested_scopes as "requestedScopes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [id]
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      // Audit log
      await pool.query(
        `INSERT INTO winamz_audit_logs (id, event_type, agent_id, org_id, created_at)
         VALUES ($1, 'agent_suspended', $2, $3, NOW())`,
        [generateStandardId(), id, row.orgId]
      );

      ctx.body = {
        ...row,
        createdAt: new Date(row.createdAt as string).toISOString(),
        updatedAt: new Date(row.updatedAt as string).toISOString(),
      };

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

      const row = await pool.maybeOne(
        `UPDATE winamz_agents
         SET status = 'approved', updated_at = NOW()
         WHERE id = $1 AND status = 'suspended'
         RETURNING id, name, type, org_id as "orgId", owner_user_id as "ownerUserId",
                   logto_app_id as "logtoAppId", status, requested_scopes as "requestedScopes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [id]
      );

      if (!row) {
        ctx.status = 404;
        return next();
      }

      ctx.body = {
        ...row,
        createdAt: new Date(row.createdAt as string).toISOString(),
        updatedAt: new Date(row.updatedAt as string).toISOString(),
      };

      return next();
    }
  );
}
