/**
 * WinAMZ Console routes.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { type RouteObject } from 'react-router-dom';
import { safeLazy } from 'react-safe-lazy';

const WinamzAgents = safeLazy(async () => import('@/pages/winamz/Agents'));
const WinamzGrants = safeLazy(async () => import('@/pages/winamz/Grants'));
const WinamzAudit = safeLazy(async () => import('@/pages/winamz/Audit'));

export const winamzAgents: RouteObject = {
  path: 'winamz/agents',
  element: <WinamzAgents />,
};

export const winamzGrants: RouteObject = {
  path: 'winamz/grants',
  element: <WinamzGrants />,
};

export const winamzAudit: RouteObject = {
  path: 'winamz/audit',
  element: <WinamzAudit />,
};
