\set ON_ERROR_STOP on
-- Cluster roles are intentionally clone-specific; no production role memberships change.
begin;
do $$
declare tenant record; policy record; role_name text; password text;
  base constant text := 'logto_tenant_logto_upgrade_144';
begin
  if current_database()<>'logto_upgrade_144' then raise exception 'Clone database required'; end if;
  if exists(select 1 from pg_roles where rolname=base) then
    raise exception 'Clone roles already exist; inspect before retry';
  end if;
  execute format('create role %I nologin noinherit nosuperuser nocreatedb nocreaterole',base);
  for tenant in select id from tenants order by id loop
    role_name := base || '_' || tenant.id;
    if length(role_name)>63 then raise exception 'Clone role name too long'; end if;
    password := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
    execute format('create role %I inherit login nosuperuser nocreatedb nocreaterole password %L in role %I',role_name,password,base);
    update tenants set db_user=role_name,db_user_password=password where id=tenant.id;
  end loop;
  -- Same standard grants and exclusions as schemas/tables/_after_all.sql.
  execute format('grant select,insert,update,delete on all tables in schema public to %I',base);
  execute format('revoke all privileges on tenants,systems,service_logs from %I',base);
  execute format('grant select(id,db_user,is_suspended,tag) on tenants to %I',base);
  for policy in select p.polname,c.relname from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and (select oid from pg_roles where rolname='logto_tenant_logto')=any(p.polroles)
  loop
    if (select cardinality(polroles) from pg_policy where polrelid=format('public.%I',policy.relname)::regclass and polname=policy.polname)<>1 then
      raise exception 'Unexpected mixed-role clone policy';
    end if;
    execute format('alter policy %I on public.%I to %I',policy.polname,policy.relname,base);
  end loop;
  revoke all privileges on all tables in schema public from logto_tenant_logto;
  revoke select(id,db_user,is_suspended,tag) on tenants from logto_tenant_logto;
  revoke connect on database logto_upgrade_144 from public;
  grant connect on database logto_upgrade_144 to logto;
  execute format('grant connect on database logto_upgrade_144 to %I',base);
end $$;
commit;
