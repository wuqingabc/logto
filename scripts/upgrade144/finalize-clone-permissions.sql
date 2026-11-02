\set ON_ERROR_STOP on
begin;
do $$
begin
  if current_database()<>'logto_upgrade_144' then raise exception 'Clone database required'; end if;
  if not exists(select 1 from pg_roles where rolname='logto_tenant_logto_upgrade_144' and not rolcanlogin and not rolsuper) then
    raise exception 'Expected isolated clone base role missing';
  end if;
end $$;
-- Canonical WinAMZ table creation grants its historical production base role.
-- Remap only privileges in this clone; no cluster memberships are modified.
grant select,insert,update,delete on winamz_agents,winamz_agent_grants,winamz_audit_logs
  to logto_tenant_logto_upgrade_144;
revoke all privileges on all tables in schema public from logto_tenant_logto;
revoke select(id,db_user,is_suspended,tag) on tenants from logto_tenant_logto;
commit;
