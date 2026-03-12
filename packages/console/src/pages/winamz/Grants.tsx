/**
 * WinAMZ Delegation Grants page.
 * Lists all active/revoked grants, provides Kill Switch capability.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { useCallback, useEffect, useState } from 'react';

import Button from '@/ds-components/Button';
import CardTitle from '@/ds-components/CardTitle';
import DynamicT from '@/ds-components/DynamicT';
import Search from '@/ds-components/Search';
import Table from '@/ds-components/Table';
import Tag from '@/ds-components/Tag';
import useApi from '@/hooks/use-api';
import pageLayout from '@/scss/page-layout.module.scss';

type Grant = {
  id: string;
  agentId: string;
  userId: string;
  orgId: string;
  grantedScopes: string[];
  grantedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
};

function WinamzGrants() {
  const api = useApi();

  const [grants, setGrants] = useState<Grant[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [showRevoked, setShowRevoked] = useState(false);
  const pageSize = 20;

  const fetchGrants = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        active: showRevoked ? 'false' : 'true',
      });
      const response = await api.get(`api/winamz/grants?${params.toString()}`);
      const items = await response.json<Grant[]>();
      const totalCount = Number(response.headers.get('Total-Number') ?? '0');
      setGrants(items);
      setTotal(totalCount);
    } finally {
      setIsLoading(false);
    }
  }, [api, page, showRevoked]);

  useEffect(() => {
    void fetchGrants();
  }, [fetchGrants]);

  const handleRevoke = useCallback(
    async (grantId: string) => {
      const reason = window.prompt('Reason for revocation (optional):') ?? undefined;
      await api.post(`api/winamz/grants/${grantId}/revoke`, { json: { reason } }).json();
      void fetchGrants();
    },
    [api, fetchGrants]
  );

  const filteredGrants = keyword
    ? grants.filter(
        (g) => g.agentId.includes(keyword) || g.userId.includes(keyword) || g.id.includes(keyword)
      )
    : grants;

  return (
    <div className={pageLayout.container}>
      <div className={pageLayout.headline}>
        <CardTitle
          title="tabs.winamz_grants"
          subtitle="winamz.grants_subtitle"
        />
        <Button
          size="small"
          title={showRevoked ? 'winamz.action_show_active' : 'winamz.action_show_revoked'}
          onClick={() => {
            setShowRevoked((prev) => !prev);
            setPage(1);
          }}
        />
      </div>
      <Table
        className={pageLayout.table}
        isLoading={isLoading}
        rowIndexKey="id"
        columns={[
          {
            title: <DynamicT forKey="winamz.col_grant_id" />,
            dataIndex: 'id',
            colSpan: 3,
            render: (grant) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{grant.id}</span>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_agent_id" />,
            dataIndex: 'agentId',
            colSpan: 3,
            render: (grant) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{grant.agentId}</span>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_user_id" />,
            dataIndex: 'userId',
            colSpan: 3,
            render: (grant) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{grant.userId}</span>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_scopes" />,
            dataIndex: 'grantedScopes',
            colSpan: 2,
            render: (grant) => (
              <div style={{ fontSize: 12 }}>{grant.grantedScopes.join(', ') || '—'}</div>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_status" />,
            dataIndex: 'status',
            colSpan: 2,
            render: (grant) => (
              <Tag type="state" status={grant.revokedAt ? 'error' : 'success'}>
                {grant.revokedAt ? 'Revoked' : 'Active'}
              </Tag>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_actions" />,
            dataIndex: 'actions',
            colSpan: 3,
            render: (grant) => {
              if (grant.revokedAt) {
                return (
                  <span style={{ fontSize: 12, color: '#888' }}>
                    {new Date(grant.revokedAt).toLocaleDateString()}
                  </span>
                );
              }

              return (
                <Button
                  size="small"
                  title="winamz.action_revoke"
                  type="danger"
                  onClick={() => {
                    void handleRevoke(grant.id);
                  }}
                />
              );
            },
          },
        ]}
        rowGroups={[{ key: 'grants', data: filteredGrants }]}
        filter={
          <Search
            defaultValue={keyword}
            isClearable={Boolean(keyword)}
            placeholder="Search by agent / user ID..."
            onSearch={setKeyword}
            onClearSearch={() => {
              setKeyword('');
            }}
          />
        }
        pagination={{
          page,
          totalCount: total,
          pageSize,
          onChange: setPage,
        }}
        placeholder="No grants found"
      />
    </div>
  );
}

export default WinamzGrants;
