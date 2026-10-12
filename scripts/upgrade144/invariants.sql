\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin isolation level repeatable read read only;
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
select 'oidc_live|' || model_name || '|' || count(*) from oidc_model_instances group by model_name order by model_name;
select 'invalid_index|' || indexrelid::regclass::text from pg_index where not indisvalid;
select 'unvalidated_constraint|' || conrelid::regclass::text || '|' || conname from pg_constraint where not convalidated;
commit;
