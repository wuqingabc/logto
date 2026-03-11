/**
 * WinAMZ Delegation Grants page.
 * Lists all active/revoked grants, provides Kill Switch capability.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { useCallback, useEffect, useState } from 'react';

import Button from '@/ds-components/Button';
import Search from '@/ds-components/Search';
import Table from '@/ds-components/Table';
import Tag from '@/ds-components/Tag';
import useApi from '@/hooks/use-api';

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
      await api
        .post(`api/winamz/grants/${grantId}/revoke`, { json: { reason } })
        .json();
      void fetchGrants();
    },
    [api, fetchGrants]
  );

  const filteredGrants = keyword
    ? grants.filter(
        (g) =>
          g.agentId.includes(keyword) ||
          g.userId.includes(keyword) ||
          g.id.includes(keyword)
      )
    : grants;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Delegation Grants</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            size="small"
            title={showRevoked ? 'Show active' : 'Show revoked'}
            onClick={() => {
              setShowRevoked((prev) => !prev);
              setPage(1);
            }}
          />
          <Search
            defaultValue={keyword}
            isClearable={Boolean(keyword)}
            placeholder="Search by agent/user ID..."
            onSearch={setKeyword}
            onClearSearch={() => { setKeyword(''); }}
          />
        </div>
      </div>
      <Table
        isLoading={isLoading}
        rowIndexKey="id"
        columns={[
          {
            title: 'Grant ID',
            dataIndex: 'id',
            render: (_, grant) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{grant.id}</span>
            ),
          },
          {
            title: 'Agent ID',
            dataIndex: 'agentId',
            render: (_, grant) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{grant.agentId}</span>
            ),
          },
          {
            title: 'User ID',
            dataIndex: 'userId',
            render: (_, grant) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{grant.userId}</span>
            ),
          },
          {
            title: 'Scopes',
            dataIndex: 'grantedScopes',
            render: (_, grant) => (
              <div style={{ fontSize: 12 }}>{grant.grantedScopes.join(', ') || '—'}</div>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (_, grant) => (
              <Tag type="state" status={grant.revokedAt ? 'error' : 'success'}>
                {grant.revokedAt ? 'Revoked' : 'Active'}
              </Tag>
            ),
          },
          {
            title: 'Actions',
            dataIndex: 'actions',
            render: (_, grant) => {
              if (grant.revokedAt) {
                return (
                  <span style={{ fontSize: 12, color: '#888' }}>
                    Revoked {new Date(grant.revokedAt).toLocaleDateString()}
                  </span>
                );
              }

              return (
                <Button
                  size="small"
                  title="Revoke (Kill Switch)"
                  type="danger"
                  onClick={() => { void handleRevoke(grant.id); }}
                />
              );
            },
          },
        ]}
        rowGroups={[{ key: 'grants', data: filteredGrants }]}
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
