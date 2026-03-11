/**
 * WinAMZ AI Agent Registry page.
 * Allows admins to view, approve, suspend, and manage AI agents.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '@/ds-components/Button';
import Search from '@/ds-components/Search';
import Table from '@/ds-components/Table';
import Tag from '@/ds-components/Tag';
import useApi from '@/hooks/use-api';

type Agent = {
  id: string;
  name: string;
  type: 'personal' | 'org';
  orgId: string;
  ownerUserId?: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'suspended';
  requestedScopes: string[];
  createdAt: string;
};

const statusTagMap: Record<Agent['status'], 'info' | 'success' | 'error' | 'alert'> = {
  pending_review: 'alert',
  approved: 'success',
  rejected: 'error',
  suspended: 'info',
};

function WinamzAgents() {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const api = useApi();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      const response = await api.get(`api/winamz/agents?${params.toString()}`);
      const items = await response.json<Agent[]>();
      const totalCount = Number(response.headers.get('Total-Number') ?? '0');
      setAgents(items);
      setTotal(totalCount);
    } finally {
      setIsLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const handleApprove = useCallback(
    async (agentId: string) => {
      await api.post(`api/winamz/agents/${agentId}/approve`).json();
      void fetchAgents();
    },
    [api, fetchAgents]
  );

  const handleSuspend = useCallback(
    async (agentId: string) => {
      await api.post(`api/winamz/agents/${agentId}/suspend`).json();
      void fetchAgents();
    },
    [api, fetchAgents]
  );

  const handleRestore = useCallback(
    async (agentId: string) => {
      await api.post(`api/winamz/agents/${agentId}/restore`).json();
      void fetchAgents();
    },
    [api, fetchAgents]
  );

  const filteredAgents = keyword
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(keyword.toLowerCase()) ||
          a.id.includes(keyword) ||
          a.orgId.includes(keyword)
      )
    : agents;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>AI Agents</h1>
        <Search
          defaultValue={keyword}
          isClearable={Boolean(keyword)}
          placeholder="Search agents..."
          onSearch={setKeyword}
          onClearSearch={() => { setKeyword(''); }}
        />
      </div>
      <Table
        isLoading={isLoading}
        rowIndexKey="id"
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            render: (_, agent) => (
              <div>
                <div style={{ fontWeight: 600 }}>{agent.name}</div>
                <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                  {agent.id}
                </div>
              </div>
            ),
          },
          {
            title: 'Type',
            dataIndex: 'type',
            render: (_, agent) => (
              <Tag type="state" status={agent.type === 'personal' ? 'info' : 'success'}>
                {agent.type === 'personal' ? 'Personal' : 'Org'}
              </Tag>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (_, agent) => (
              <Tag type="state" status={statusTagMap[agent.status]}>
                {agent.status.replace('_', ' ')}
              </Tag>
            ),
          },
          {
            title: 'Scopes',
            dataIndex: 'requestedScopes',
            render: (_, agent) => (
              <div style={{ fontSize: 12 }}>
                {agent.requestedScopes.length === 0
                  ? '—'
                  : agent.requestedScopes.join(', ')}
              </div>
            ),
          },
          {
            title: 'Actions',
            dataIndex: 'actions',
            render: (_, agent) => (
              <div style={{ display: 'flex', gap: 8 }}>
                {agent.status === 'pending_review' && (
                  <Button
                    size="small"
                    title="Approve"
                    type="primary"
                    onClick={() => { void handleApprove(agent.id); }}
                  />
                )}
                {agent.status === 'approved' && (
                  <Button
                    size="small"
                    title="Suspend"
                    type="danger"
                    onClick={() => { void handleSuspend(agent.id); }}
                  />
                )}
                {agent.status === 'suspended' && (
                  <Button
                    size="small"
                    title="Restore"
                    onClick={() => { void handleRestore(agent.id); }}
                  />
                )}
              </div>
            ),
          },
        ]}
        rowGroups={[{ key: 'agents', data: filteredAgents }]}
        pagination={{
          page,
          totalCount: total,
          pageSize,
          onChange: setPage,
        }}
        placeholder="No agents found"
      />
    </div>
  );
}

export default WinamzAgents;
