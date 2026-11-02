\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin isolation level repeatable read read only;
select 'snapshot_epoch|' || extract(epoch from transaction_timestamp());
-- Output only counts and digests; credentials and callback URLs remain private.
select 'database|' || current_database();
select 'alteration|' || coalesce(value->>'timestamp','0') from systems where key='alterationState';
select 'users|' || count(*) || '|' || md5(coalesce(string_agg((jsonb_build_array(tenant_id,id,username,primary_email,primary_phone,password_encrypted,password_encryption_method,identities,mfa_verifications,is_suspended))::text,E'\n' order by tenant_id,id),'')) from users;
select 'applications|' || count(*) || '|' || md5(coalesce(string_agg((jsonb_build_array(tenant_id,id,secret,type,oidc_client_metadata,custom_client_metadata,protected_app_metadata,custom_data))::text,E'\n' order by tenant_id,id),'')) from applications;
select 'callbacks|' || count(*) || '|' || md5(coalesce(string_agg((jsonb_build_array(tenant_id,id,oidc_client_metadata->'redirectUris',oidc_client_metadata->'postLogoutRedirectUris'))::text,E'\n' order by tenant_id,id),'')) from applications;
select 'connectors|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(c)::text,E'\n' order by tenant_id,id),'')) from connectors c;
select 'sso_connectors|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(c)::text,E'\n' order by tenant_id,id),'')) from sso_connectors c;
select 'tenant_ids|' || count(*) || '|' || md5(coalesce(string_agg(id,E'\n' order by id),'')) from tenants;
select 'resources|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' order by tenant_id,id),'')) from resources r;
select 'roles|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' order by tenant_id,id),'')) from roles r;
select 'roles_scopes|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' order by tenant_id,id),'')) from roles_scopes r;
select 'users_roles|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' order by tenant_id,id),'')) from users_roles r;
select 'logto_configs|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(c)::text,E'\n' order by tenant_id,key),'')) from logto_configs c;
-- Include all organization data and the three custom tables (absent means empty).
select case when to_regclass('public.' || tablename) is null
  then format('select %L', 'table_digest|' || tablename || '|0|' || md5(''))
  else format($query$select 'table_digest|%s|' || count(*) || '|' ||
    md5(coalesce(string_agg((to_jsonb(t)-'is_trusted_device_allowed'-'cimd_client_id')::text,E'\n' order by (to_jsonb(t)-'is_trusted_device_allowed'-'cimd_client_id')::text),''))
    from public.%I t$query$,tablename,tablename) end
  from (select tablename from pg_tables where schemaname='public'
    and (tablename like 'organization%' or tablename in
      ('oidc_session_extensions','saml_application_sessions','idp_initiated_saml_sso_sessions'))
    union select unnest(array['winamz_agents','winamz_agent_grants','winamz_audit_logs'])) tables
  order by tablename
\gexec
-- Preserve each old scope/link; only the management API all-scope seed may add rows.
select 'seed_missing_resource|' || md5(jsonb_build_array(r.tenant_id,r.id)::text)
  from resources r where r.indicator like '%.logto.app/api' and not exists
  (select 1 from scopes s where s.tenant_id=r.tenant_id and s.resource_id=r.id and s.name='all')
  order by r.tenant_id,r.id;
select 'scope_count|' || count(*) from scopes;
select 'scope_row|' || md5(to_jsonb(s)::text) || '|' || md5(jsonb_build_array(s.tenant_id,s.resource_id)::text)
  || '|' || md5(jsonb_build_array(s.tenant_id,s.id)::text) || '|' ||
  case when r.indicator like '%.logto.app/api' and s.name='all'
    and s.description='Default scope for Management API, allows all permissions.' then 'seed' else 'other' end
  from scopes s left join resources r on r.tenant_id=s.tenant_id and r.id=s.resource_id order by s.tenant_id,s.id;
select 'role_scope_row|' || md5(to_jsonb(rs)::text) || '|' || md5(jsonb_build_array(s.tenant_id,s.resource_id)::text)
  || '|' || md5(jsonb_build_array(rs.tenant_id,rs.scope_id)::text) || '|' ||
  case when r.indicator like '%.logto.app/api' and s.name='all'
    and ro.name='Logto Management API access' then 'seed' else 'other' end
  from roles_scopes rs left join scopes s on s.tenant_id=rs.tenant_id and s.id=rs.scope_id
  left join resources r on r.tenant_id=s.tenant_id and r.id=s.resource_id
  left join roles ro on ro.tenant_id=rs.tenant_id and ro.id=rs.role_id order by rs.tenant_id,rs.id;
-- Preserve complete live OIDC payload/metadata; expired rows may be garbage-collected.
-- IDs and tokens never leave the database; only hashes and expiry times are emitted.
select 'oidc_row|' || md5(jsonb_build_array(tenant_id,model_name,id)::text) || '|' ||
  coalesce(extract(epoch from expires_at)::text,'never') || '|' || md5(to_jsonb(o)::text)
  from oidc_model_instances o where expires_at is null or expires_at>transaction_timestamp()
  order by tenant_id,model_name,id;
select 'oidc_live|' || model_name || '|' || count(*) from oidc_model_instances group by model_name order by model_name;
select 'invalid_index|' || indexrelid::regclass::text from pg_index where not indisvalid;
select 'unvalidated_constraint|' || conrelid::regclass::text || '|' || conname from pg_constraint where not convalidated;
select 'capture_complete|1';
commit;
