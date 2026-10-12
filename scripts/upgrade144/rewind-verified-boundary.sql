\set ON_ERROR_STOP on
-- Caller MUST set expected_database explicitly. Production requires paused writers + final backup.
select set_config('winamz.expected_database', :'expected_database', false);
begin;
do $$
declare current_timestamp_value numeric;
begin
  if current_database() <> current_setting('winamz.expected_database')
     or current_database() not in ('logto', 'logto_upgrade_144') then
    raise exception 'Wrong target database';
  end if;
  select (value->>'timestamp')::numeric into current_timestamp_value from systems where key='alterationState' for update;
  if current_timestamp_value is distinct from 1781448279 then
    raise exception 'Expected historical custom seed watermark, got %', current_timestamp_value;
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
     where c.relname='oidc_model_instances__model_name_payload_grant_id_partial'
       and i.indisvalid and i.indisready and i.indrelid='oidc_model_instances'::regclass
       and pg_get_expr(i.indpred,i.indrelid) = '(payload ? ''grantId''::text)') then
    raise exception 'Existing grant index must be valid with expected predicate';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and
    ((table_name='account_centers' and column_name in ('delete_account_url','custom_css','profile_fields')) or
     (table_name='sign_in_experiences' and column_name in ('sign_up_profile_fields','custom_ui_csp','password_expiration','username_policy','verification_code_policy')) or
     (table_name='applications' and column_name='app_level_access_control_enabled') or
     (table_name='users' and column_name in ('password_updated_at','is_password_expired')))) then
    raise exception 'Upstream gap schema already partially applied; inspect instead of replaying blindly';
  end if;
  if exists (select 1 from pg_class where relname in (
    'application_access_control_user_relations','application_access_control_user_role_relations',
    'application_access_control_organization_relations','application_access_control_org_role_relations',
    'oidc_model_instances__grant_payload_account_id_expires_at','users__tenant_lower_username',
    'organization_user_relations__tenant_id_user_id','organization_role_user_relations__tenant_id_org_id_user_id')) then
    raise exception 'Upstream gap tables/indexes already partially applied';
  end if;
  if exists(select 1 from pg_class where oid='oidc_model_instances'::regclass and reloptions is not null) then
    raise exception 'Unexpected OIDC reloptions; inspect autovacuum before replay';
  end if;
  if to_regclass('oidc_model_instances__model_name_payload_grant_id') is null then
    raise exception 'Expected legacy grant index has already been dropped';
  end if;
  update systems set value=jsonb_set(value,'{timestamp}','1772615848'::jsonb) where key='alterationState';
end $$;
commit;
