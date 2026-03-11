/**
 * WinAMZ routes entry point.
 * Registers all winamz-specific routes on the management router.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import type { ManagementApiRouter, RouterInitArgs } from '../types.js';

import winamzAgentRoutes from './agents.js';
import winamzAuditRoutes from './audit.js';
import winamzGrantRoutes from './grants.js';

export default function winamzRoutes<T extends ManagementApiRouter>(
  ...args: RouterInitArgs<T>
) {
  winamzAgentRoutes(...args);
  winamzGrantRoutes(...args);
  winamzAuditRoutes(...args);
}
