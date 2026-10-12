\set ON_ERROR_STOP on
begin read only;
do $$
declare missing integer;
begin
  if coalesce((select (value->>'timestamp')::numeric from systems where key='alterationState'),0) < 1789000001 then
    raise exception 'Alteration watermark below 1.44 user-ID migration';
  end if;
  select count(*) into missing from (values
    ('account_centers','delete_account_url'),('account_centers','custom_css'),('account_centers','profile_fields'),
    ('sign_in_experiences','sign_up_profile_fields'),('sign_in_experiences','custom_ui_csp'),
    ('sign_in_experiences','password_expiration'),('sign_in_experiences','username_policy'),
    ('sign_in_experiences','verification_code_policy'),('applications','app_level_access_control_enabled'),
    ('users','password_updated_at'),('users','is_password_expired')) required(t,c)
    where not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c);
  if missing<>0 then raise exception 'Missing required upstream gap columns: %',missing; end if;
  if exists(select 1 from organizations where is_trusted_device_allowed is distinct from true) then
    raise exception 'Organization trusted-device default changed during migration';
  end if;
  if exists(select 1 from oidc_session_extensions where cimd_client_id is not null) then
    raise exception 'Legacy session unexpectedly gained a CIMD client ID';
  end if;
  if exists(select 1 from pg_index where not indisvalid) then raise exception 'Invalid indexes'; end if;
  if exists(select 1 from pg_constraint where not convalidated) then raise exception 'Unvalidated constraints'; end if;
  if exists(select 1 from resources r where r.indicator like '%.logto.app/api' and not exists(
    select 1 from scopes s where s.tenant_id=r.tenant_id and s.resource_id=r.id and s.name='all')) then
    raise exception 'Management API resources still missing all scope';
  end if;
  if coalesce((select character_maximum_length from information_schema.columns where table_schema='public' and table_name='users' and column_name='id'),0)<>128 then
    raise exception 'users.id not widened to128';
  end if;
  select count(*) into missing from (values
    ('winamz_agents','owner_user_id'),('winamz_agent_grants','user_id'),
    ('winamz_agent_grants','revoked_by'),('winamz_audit_logs','user_id'),
    ('winamz_audit_logs','actor_id')) required(t,c)
    where not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=t and column_name=c and data_type='character varying' and character_maximum_length=128);
  if missing<>0 then raise exception 'Custom user reference columns missing or not128: %',missing; end if;
  select count(*) into missing from pg_constraint fk
    cross join lateral unnest(fk.conkey) with ordinality src(attnum,n)
    join lateral unnest(fk.confkey) with ordinality dst(attnum,n) on src.n=dst.n
    join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=src.attnum
    join pg_attribute b on b.attrelid=fk.confrelid and b.attnum=dst.attnum
    where fk.contype='f' and fk.confrelid='users'::regclass and b.attname='id' and a.atttypmod<>132;
  if missing<>0 then raise exception 'User foreign-key widths not128: %',missing; end if;
end $$;
select 'schema-gates-passed';
commit;
