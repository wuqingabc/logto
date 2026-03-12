/**
 * WinAMZ AI Agent Registry page.
 * Allows admins to view, approve, suspend, and manage AI agents.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { useCallback, useEffect, useState } from 'react';

import Plus from '@/assets/icons/plus.svg?react';
import RolesEmptyDark from '@/assets/images/roles-empty-dark.svg?react';
import RolesEmpty from '@/assets/images/roles-empty.svg?react';
import EmptyDataPlaceholder from '@/components/EmptyDataPlaceholder';
import ItemPreview from '@/components/ItemPreview';
import Button from '@/ds-components/Button';
import CardTitle from '@/ds-components/CardTitle';
import Search from '@/ds-components/Search';
import Table from '@/ds-components/Table';
import TablePlaceholder from '@/ds-components/Table/TablePlaceholder';
import Tag from '@/ds-components/Tag';
import useApi from '@/hooks/use-api';
import useTenantPathname from '@/hooks/use-tenant-pathname';
import pageLayout from '@/scss/page-layout.module.scss';

import CreateAgentModal from './components/CreateAgentModal';

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
  const api = useApi();
  const { navigate } = useTenantPathname();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
    <div className={pageLayout.container}>
      <div className={pageLayout.headline}>
        <CardTitle
          title="tabs.winamz_agents"
          subtitle="winamz.agents_subtitle"
        />
        <Button
          icon={<Plus />}
          type="primary"
          size="large"
          title="winamz.action_create_agent"
          onClick={() => {
            setIsCreateModalOpen(true);
          }}
        />
      </div>
      <Table
        className={pageLayout.table}
        isLoading={isLoading}
        rowIndexKey="id"
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            colSpan: 5,
            render: (agent) => (
              <ItemPreview
                title={agent.name}
                subtitle={agent.id}
                to={`/winamz/agents/${agent.id}`}
              />
            ),
          },
          {
            title: 'Type',
            dataIndex: 'type',
            colSpan: 2,
            render: (agent) => (
              <Tag type="state" status={agent.type === 'personal' ? 'info' : 'success'}>
                {agent.type === 'personal' ? 'Personal' : 'Org'}
              </Tag>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            colSpan: 3,
            render: (agent) => (
              <Tag type="state" status={statusTagMap[agent.status]}>
                {agent.status.replace(/_/g, ' ')}
              </Tag>
            ),
          },
          {
            title: 'Scopes',
            dataIndex: 'requestedScopes',
            colSpan: 3,
            render: (agent) => (
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
            colSpan: 3,
            render: (agent) => (
              <div
                style={{ display: 'flex', gap: 8 }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {agent.status === 'pending_review' && (
                  <Button
                    size="small"
                    title="winamz.action_approve"
                    type="primary"
                    onClick={() => {
                      void handleApprove(agent.id);
                    }}
                  />
                )}
                {agent.status === 'approved' && (
                  <Button
                    size="small"
                    title="winamz.action_suspend"
                    type="danger"
                    onClick={() => {
                      void handleSuspend(agent.id);
                    }}
                  />
                )}
                {agent.status === 'suspended' && (
                  <Button
                    size="small"
                    title="winamz.action_restore"
                    onClick={() => {
                      void handleRestore(agent.id);
                    }}
                  />
                )}
              </div>
            ),
          },
        ]}
        rowGroups={[{ key: 'agents', data: filteredAgents }]}
        rowClickHandler={(agent) => {
          navigate(`/winamz/agents/${agent.id}`);
        }}
        filter={
          <Search
            defaultValue={keyword}
            isClearable={Boolean(keyword)}
            placeholder="Search agents..."
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
        placeholder={
          keyword ? (
            <EmptyDataPlaceholder />
          ) : (
            <TablePlaceholder
              image={<RolesEmpty />}
              imageDark={<RolesEmptyDark />}
              title="tabs.winamz_agents"
              description="tabs.winamz_agents_placeholder_description"
              action={
                <Button
                  title="winamz.action_create_agent"
                  type="primary"
                  size="large"
                  icon={<Plus />}
                  onClick={() => {
                    setIsCreateModalOpen(true);
                  }}
                />
              }
            />
          )
        }
      />
      <CreateAgentModal
        isOpen={isCreateModalOpen}
        onClose={(createdId) => {
          setIsCreateModalOpen(false);
          if (createdId) {
            void fetchAgents();
          }
        }}
      />
    </div>
  );
}

export default WinamzAgents;
