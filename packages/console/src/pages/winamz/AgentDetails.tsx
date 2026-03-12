/**
 * WinAMZ AI Agent Details page.
 * Allows admins to view, edit, manage status, and delete an AI agent.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';

import DetailsPage from '@/components/DetailsPage';
import Button from '@/ds-components/Button';
import Card from '@/ds-components/Card';
import DeleteConfirmModal from '@/ds-components/DeleteConfirmModal';
import DynamicT from '@/ds-components/DynamicT';
import FormField from '@/ds-components/FormField';
import Tag from '@/ds-components/Tag';
import TextInput from '@/ds-components/TextInput';
import useApi, { type RequestError } from '@/hooks/use-api';
import useTenantPathname from '@/hooks/use-tenant-pathname';
import { trySubmitSafe } from '@/utils/form';

type Agent = {
  id: string;
  name: string;
  type: 'personal' | 'org';
  orgId: string;
  ownerUserId?: string | null;
  logtoAppId?: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'suspended';
  requestedScopes: string[];
  createdAt: string;
};

type FormData = {
  name: string;
  requestedScopes: string;
};

const statusTagMap: Record<Agent['status'], 'info' | 'success' | 'error' | 'alert'> = {
  pending_review: 'alert',
  approved: 'success',
  rejected: 'error',
  suspended: 'info',
};

const agentsPath = '/winamz/agents';

function AgentDetails() {
  const { id } = useParams();
  const { navigate } = useTenantPathname();
  const api = useApi();

  const {
    data: agent,
    error,
    mutate,
  } = useSWR<Agent, RequestError>(id && `api/winamz/agents/${id}`);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>();

  useEffect(() => {
    if (agent) {
      reset({
        name: agent.name,
        requestedScopes: agent.requestedScopes.join(', '),
      });
    }
  }, [agent, reset]);

  const onSave = handleSubmit(
    trySubmitSafe(async ({ name, requestedScopes }) => {
      const scopes = requestedScopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await api
        .patch(`api/winamz/agents/${id!}`, { json: { name, requestedScopes: scopes } })
        .json<Agent>();
      void mutate(updated);
      reset({ name: updated.name, requestedScopes: updated.requestedScopes.join(', ') });
    })
  );

  const handleApprove = useCallback(async () => {
    const updated = await api.post(`api/winamz/agents/${id!}/approve`).json<Agent>();
    void mutate(updated);
  }, [api, id, mutate]);

  const handleSuspend = useCallback(async () => {
    const updated = await api.post(`api/winamz/agents/${id!}/suspend`).json<Agent>();
    void mutate(updated);
  }, [api, id, mutate]);

  const handleRestore = useCallback(async () => {
    const updated = await api.post(`api/winamz/agents/${id!}/restore`).json<Agent>();
    void mutate(updated);
  }, [api, id, mutate]);

  const handleDelete = useCallback(async () => {
    if (!id || isDeleting) {
      return;
    }
    setIsDeleting(true);
    try {
      await api.delete(`api/winamz/agents/${id}`);
      navigate(agentsPath);
    } finally {
      setIsDeleting(false);
    }
  }, [api, id, isDeleting, navigate]);

  return (
    <DetailsPage
      backLink={agentsPath}
      backLinkTitle="tabs.winamz_agents"
      isLoading={!agent && !error}
      error={error}
    >
      {agent && (
        <>
          {/* Header */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>{agent.name}</h2>
              <Tag type="state" status={statusTagMap[agent.status]}>
                {agent.status.replace(/_/g, ' ')}
              </Tag>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                fontFamily: 'monospace',
                marginTop: 8,
              }}
            >
              {agent.id}
            </div>
          </Card>

          {/* Edit form */}
          <Card>
            <form>
              <FormField isRequired title="general.name">
                <TextInput
                  error={Boolean(errors.name)}
                  {...register('name', { required: true })}
                />
              </FormField>
              <FormField title="winamz.field_type">
                <div style={{ display: 'flex', alignItems: 'center', height: 36 }}>
                  <Tag type="state" status={agent.type === 'personal' ? 'info' : 'success'}>
                    {agent.type === 'personal' ? 'Personal' : 'Organization'}
                  </Tag>
                </div>
              </FormField>
              <FormField title="winamz.field_organization_id">
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 14,
                    padding: '8px 12px',
                    background: 'var(--color-surface-variant)',
                    borderRadius: 4,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {agent.orgId}
                </div>
              </FormField>
              {agent.type === 'personal' && (
                <FormField title="winamz.field_owner_user_id">
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 14,
                      padding: '8px 12px',
                      background: 'var(--color-surface-variant)',
                      borderRadius: 4,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {agent.ownerUserId ?? '—'}
                  </div>
                </FormField>
              )}
              <FormField title="winamz.field_logto_app_id">
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 14,
                    padding: '8px 12px',
                    background: 'var(--color-surface-variant)',
                    borderRadius: 4,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {agent.logtoAppId ?? '—'}
                </div>
              </FormField>
              <FormField title="winamz.field_requested_scopes">
                <TextInput
                  placeholder="scope1, scope2, scope3"
                  {...register('requestedScopes')}
                />
              </FormField>
              <div style={{ marginTop: 16 }}>
                <Button
                  type="primary"
                  title="general.save_changes"
                  isLoading={isSubmitting}
                  disabled={!isDirty}
                  onClick={onSave}
                />
              </div>
            </form>
          </Card>

          {/* Status actions */}
          {agent.status !== 'rejected' && (
            <Card>
              <div
                style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-text)' }}
              >
                <DynamicT forKey="winamz.section_status_management" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {agent.status === 'pending_review' && (
                  <Button
                    type="primary"
                    title="winamz.action_approve"
                    onClick={() => {
                      void handleApprove();
                    }}
                  />
                )}
                {agent.status === 'approved' && (
                  <Button
                    type="danger"
                    title="winamz.action_suspend"
                    onClick={() => {
                      void handleSuspend();
                    }}
                  />
                )}
                {agent.status === 'suspended' && (
                  <Button
                    title="winamz.action_restore"
                    onClick={() => {
                      void handleRestore();
                    }}
                  />
                )}
              </div>
            </Card>
          )}

          {/* Danger zone */}
          <Card>
            <div
              style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-error)' }}
            >
              <DynamicT forKey="winamz.section_danger_zone" />
            </div>
            <Button
              type="danger"
              title="winamz.action_delete_agent"
              onClick={() => {
                setIsDeleteModalOpen(true);
              }}
            />
            <DeleteConfirmModal
              isOpen={isDeleteModalOpen}
              isLoading={isDeleting}
              onCancel={() => {
                setIsDeleteModalOpen(false);
              }}
              onConfirm={handleDelete}
            >
              <DynamicT forKey="winamz.delete_agent_confirm" />
            </DeleteConfirmModal>
          </Card>
        </>
      )}
    </DetailsPage>
  );
}

export default AgentDetails;
