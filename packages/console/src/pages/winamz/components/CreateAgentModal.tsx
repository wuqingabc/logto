/**
 * WinAMZ Create AI Agent modal.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import ReactModal from 'react-modal';
import useSWR from 'swr';

import Button from '@/ds-components/Button';
import FormField from '@/ds-components/FormField';
import ModalLayout from '@/ds-components/ModalLayout';
import Select from '@/ds-components/Select';
import MultiSelect, { type Option } from '@/ds-components/Select/MultiSelect';
import TextInput from '@/ds-components/TextInput';
import useApi from '@/hooks/use-api';
import useSearchValues from '@/hooks/use-search-values';
import modalStyles from '@/scss/modal.module.scss';
import { trySubmitSafe } from '@/utils/form';
import { buildUrl, formatSearchKeyword } from '@/utils/url';

type OrgItem = { id: string; name: string };
type UserItem = {
  id: string;
  name?: string | null;
  username?: string | null;
  primaryEmail?: string | null;
};

type FormData = {
  name: string;
  type: 'personal' | 'org';
  org: Array<Option<string>>;
  ownerUser: Array<Option<string>>;
};

type Props = {
  readonly isOpen: boolean;
  readonly onClose: (createdId?: string) => void;
};

const typeOptions = [
  { value: 'personal' as const, title: 'Personal' },
  { value: 'org' as const, title: 'Organization' },
];

const getUserDisplayTitle = (user: UserItem): string =>
  user.name ?? user.username ?? user.primaryEmail ?? user.id;

function CreateAgentModal({ isOpen, onClose }: Props) {
  const api = useApi();
  const [orgKeyword, setOrgKeyword] = useState('');
  const [ownerKeyword, setOwnerKeyword] = useState('');

  // Organization search (SchemaRouter uses `q` param)
  const { data: orgs, isLoading: isOrgsLoading } = useSearchValues<OrgItem>(
    'api/organizations',
    orgKeyword
  );

  // User search (admin-user search uses `search` param with fuzzy wildcards)
  const { data: usersData, isLoading: isUsersLoading } = useSWR<[UserItem[], number]>(
    ownerKeyword
      ? buildUrl('api/users', {
          search: formatSearchKeyword(ownerKeyword),
          page: '1',
          page_size: '10',
        })
      : null
  );
  const users = usersData?.[0] ?? [];

  const {
    reset,
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ defaultValues: { type: 'org', org: [], ownerUser: [] } });

  const agentType = watch('type');

  useEffect(() => {
    if (isOpen) {
      reset({ type: 'org', org: [], ownerUser: [] });
      setOrgKeyword('');
      setOwnerKeyword('');
    }
  }, [isOpen, reset]);

  // Clear owner selection when switching to org type
  useEffect(() => {
    if (agentType === 'org') {
      setValue('ownerUser', []);
      setOwnerKeyword('');
    }
  }, [agentType, setValue]);

  const submit = handleSubmit(
    trySubmitSafe(async ({ name, type, org, ownerUser }) => {
      const orgId = org[0]!.value;
      const ownerUserId = ownerUser[0]?.value;
      const body: Record<string, unknown> = { name, type, orgId };
      if (type === 'personal' && ownerUserId) {
        body.ownerUserId = ownerUserId;
      }
      const { id } = await api
        .post('api/winamz/agents', { json: body })
        .json<{ id: string }>();
      onClose(id);
    })
  );

  return (
    <ReactModal
      isOpen={isOpen}
      className={modalStyles.content}
      overlayClassName={modalStyles.overlay}
      onRequestClose={() => {
        onClose();
      }}
    >
      <ModalLayout
        title="tabs.winamz_create_agent"
        footer={
          <Button
            type="primary"
            title="general.create"
            isLoading={isSubmitting}
            onClick={submit}
          />
        }
        onClose={onClose}
      >
        <form>
          <FormField isRequired title="general.name">
            <TextInput
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              error={Boolean(errors.name)}
              {...register('name', { required: true })}
            />
          </FormField>

          <FormField isRequired title="winamz.field_type">
            <Controller
              control={control}
              name="type"
              rules={{ required: true }}
              render={({ field: { value, onChange } }) => (
                <Select
                  value={value}
                  options={typeOptions}
                  onChange={onChange}
                  error={Boolean(errors.type)}
                />
              )}
            />
          </FormField>

          <FormField isRequired title="winamz.field_organization">
            <Controller
              control={control}
              name="org"
              rules={{ validate: (v) => v.length > 0 }}
              render={({ field: { value, onChange } }) => (
                <MultiSelect
                  value={value}
                  options={orgs.map(({ id, name }) => ({ value: id, title: name }))}
                  isOptionsLoading={isOrgsLoading}
                  isReadOnly={value.length >= 1}
                  error={Boolean(errors.org)}
                  onSearch={setOrgKeyword}
                  onChange={onChange}
                />
              )}
            />
          </FormField>

          {agentType === 'personal' && (
            <FormField title="winamz.field_owner_user">
              <Controller
                control={control}
                name="ownerUser"
                render={({ field: { value, onChange } }) => (
                  <MultiSelect
                    value={value}
                    options={users.map((user) => ({
                      value: user.id,
                      title: getUserDisplayTitle(user),
                    }))}
                    isOptionsLoading={isUsersLoading}
                    isReadOnly={value.length >= 1}
                    onSearch={setOwnerKeyword}
                    onChange={onChange}
                  />
                )}
              />
            </FormField>
          )}
        </form>
      </ModalLayout>
    </ReactModal>
  );
}

export default CreateAgentModal;
