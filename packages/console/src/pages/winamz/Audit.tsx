/**
 * WinAMZ Agent Audit Log page.
 * Provides filterable, paginated view of all AI agent audit events.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { useCallback, useEffect, useState } from 'react';

import CardTitle from '@/ds-components/CardTitle';
import DynamicT from '@/ds-components/DynamicT';
import Search from '@/ds-components/Search';
import Table from '@/ds-components/Table';
import Tag from '@/ds-components/Tag';
import useApi from '@/hooks/use-api';
import pageLayout from '@/scss/page-layout.module.scss';

type AuditLog = {
  id: string;
  eventType: string;
  orgId?: string | null;
  agentId?: string | null;
  userId?: string | null;
  actorId?: string | null;
  resource?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

const eventTypeColors: Record<string, 'info' | 'success' | 'error' | 'alert'> = {
  agent_registered: 'info',
  agent_approved: 'success',
  agent_suspended: 'error',
  grant_created: 'success',
  grant_revoked: 'alert',
  agent_action: 'info',
  token_issued: 'info',
};

function WinamzAudit() {
  const api = useApi();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (keyword) {
        params.set('agent_id', keyword);
      }
      const response = await api.get(`api/winamz/audit?${params.toString()}`);
      const items = await response.json<AuditLog[]>();
      const totalCount = Number(response.headers.get('Total-Number') ?? '0');
      setLogs(items);
      setTotal(totalCount);
    } finally {
      setIsLoading(false);
    }
  }, [api, page, keyword]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  return (
    <div className={pageLayout.container}>
      <div className={pageLayout.headline}>
        <CardTitle
          title="tabs.winamz_audit"
          subtitle="winamz.audit_subtitle"
        />
      </div>
      <Table
        className={pageLayout.table}
        isLoading={isLoading}
        rowIndexKey="id"
        columns={[
          {
            title: <DynamicT forKey="winamz.col_event" />,
            dataIndex: 'eventType',
            colSpan: 3,
            render: (log) => (
              <Tag type="state" status={eventTypeColors[log.eventType] ?? 'info'}>
                {log.eventType}
              </Tag>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_agent_id" />,
            dataIndex: 'agentId',
            colSpan: 3,
            render: (log) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{log.agentId ?? '—'}</span>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_user_id" />,
            dataIndex: 'userId',
            colSpan: 2,
            render: (log) => (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{log.userId ?? '—'}</span>
            ),
          },
          {
            title: <DynamicT forKey="winamz.col_resource" />,
            dataIndex: 'resource',
            colSpan: 2,
            render: (log) => <span style={{ fontSize: 12 }}>{log.resource ?? '—'}</span>,
          },
          {
            title: <DynamicT forKey="winamz.col_metadata" />,
            dataIndex: 'metadata',
            colSpan: 3,
            render: (log) =>
              log.metadata ? (
                <pre
                  style={{
                    fontSize: 11,
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(log.metadata, null, 1)}
                </pre>
              ) : (
                '—'
              ),
          },
          {
            title: <DynamicT forKey="winamz.col_time" />,
            dataIndex: 'createdAt',
            colSpan: 3,
            render: (log) => (
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {new Date(log.createdAt).toLocaleString()}
              </span>
            ),
          },
        ]}
        rowGroups={[{ key: 'logs', data: logs }]}
        filter={
          <Search
            defaultValue={keyword}
            isClearable={Boolean(keyword)}
            placeholder="Filter by agent ID..."
            onSearch={(kw) => {
              setKeyword(kw);
              setPage(1);
            }}
            onClearSearch={() => {
              setKeyword('');
              setPage(1);
            }}
          />
        }
        pagination={{
          page,
          totalCount: total,
          pageSize,
          onChange: setPage,
        }}
        placeholder="No audit logs found"
      />
    </div>
  );
}

export default WinamzAudit;
