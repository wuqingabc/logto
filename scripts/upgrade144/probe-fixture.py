#!/usr/bin/env python3
"""Clone-only fixture. prepare writes private files; setup/cleanup mutate ONLY logto_upgrade_144.
Run as root on DB host: probe-fixture.py prepare|setup|cleanup [BACKUP_DIR].
Do not run setup until migration invariants and schema gates pass.
"""
import json
import os
import pathlib
import secrets
import stat
import subprocess
import sys

DB = 'logto_upgrade_144'
BASE = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/srv/winamz/backups/logto144-20261012')
ACTION = sys.argv[1] if len(sys.argv) > 1 else ''
STAGE = 'validation'


def check(value):
    if not value:
        raise RuntimeError('fixture validation failed')


def run(args, data=None):
    result = subprocess.run(args, input=data, universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    check(result.returncode == 0)
    return result.stdout.strip()


def sql(statement):
    return run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB], statement)


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def write_private(path, value):
    check(not path.is_symlink())
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as handle:
        handle.write(value)


def app_config(client_id):
    result = sql("""select json_build_object('clientId', a.id, 'clientSecret', coalesce(
      (select value from application_secrets s where s.tenant_id=a.tenant_id and s.application_id=a.id
       and (s.expires_at is null or s.expires_at>now()) order by s.created_at desc limit 1), a.secret),
      'redirectUris', a.oidc_client_metadata->'redirectUris') from applications a
      where tenant_id='default' and id=%s and not is_third_party and type='Traditional'""" % quote(client_id))
    result = json.loads(result)
    check(result['clientSecret'] and result['redirectUris'])
    return result


try:
    check(os.geteuid() == 0 and str(BASE).startswith('/srv/winamz/backups/logto144-'))
    check(ACTION in ['prepare', 'setup', 'cleanup'])
    check(sql('select current_database()') == DB)
    BASE.mkdir(mode=0o700, parents=True, exist_ok=True)
    probe_path = BASE / 'probe.json'
    private_path = BASE / 'probe-fixture-private.json'
    if ACTION == 'prepare':
        check(not probe_path.exists() and not private_path.exists())
        STAGE = 'cloned client lookup'
        client = app_config('winamz-seller-spa')
        downstream = app_config('jccqeq086ohvly0ijsrmq')
        password = 'L144!' + secrets.token_urlsafe(36) + 'aA9'
        # Reproduce upstream workers/tasks/argon2i.ts exactly using the installed image's hash-wasm.
        # Isolated read-only, no-network container; password passes via stdin, never argv/env/logs.
        STAGE = 'isolated password hash'
        image = run(['docker', 'inspect', '--format', '{{.Config.Image}}', 'winamz-logto'])
        node = """const {createRequire}=require('node:module');const fs=require('node:fs');
const {argon2i,argon2Verify}=createRequire('/app/packages/core/package.json')('hash-wasm');
(async()=>{const password=fs.readFileSync(0,'utf8');const hash=await argon2i({password,
salt:require('node:crypto').randomBytes(16),iterations:8,parallelism:1,memorySize:8192,
hashLength:32,outputType:'encoded'});if(!await argon2Verify({password,hash}))process.exit(1);
process.stdout.write(hash);})().catch(()=>process.exit(1));"""
        password_hash = run(['docker', 'run', '--rm', '-i', '--network', 'none', '--read-only', '--entrypoint', 'node', image, '-e', node], password)
        STAGE = 'password hash parameters'
        check(password_hash.startswith('$argon2i$v=19$m=8192,t=8,p=1$'))
        suffix = secrets.token_hex(8)
        ids = {key: 'l144p' + secrets.token_hex(8) for key in ['user', 'org', 'role', 'orgRole', 'userRole']}
        username = 'l144_probe_' + suffix
        base_scopes = 'openid profile email offline_access urn:logto:scope:organizations urn:logto:scope:organization_roles'
        STAGE = 'API scope lookup'
        api_scopes = sql("select coalesce(string_agg(s.name,' ' order by s.name),'') from scopes s join resources r on r.id=s.resource_id and r.tenant_id=s.tenant_id where r.tenant_id='default' and r.indicator='https://api.winamz.com'")
        config = dict(endpoint='http://127.0.0.1:3192', clientId=client['clientId'],
                      clientSecret=client['clientSecret'], redirectUri=client['redirectUris'][0],
                      username=username, password=password, organizationId=ids['org'],
                      origin='tauri://localhost', audience='https://api.winamz.com',
                      scope=base_scopes + (' ' + api_scopes if api_scopes else ''),
                      ssoClientId=downstream['clientId'], ssoClientSecret=downstream['clientSecret'],
                      ssoRedirectUri=downstream['redirectUris'][0])
        private = dict(ids=ids, username=username, passwordHash=password_hash,
                       marker='clone144-probe-' + suffix, database=DB)
        STAGE = 'private fixture files'
        write_private(private_path, json.dumps(private) + '\n')
        write_private(probe_path, json.dumps(config) + '\n')
        # Stage the cloned runtime only. Preserve all other environment values verbatim.
        STAGE = 'cloned allowlist environment'
        env_path = BASE / 'clone.env'
        check(env_path.is_file() and not env_path.is_symlink() and stat.S_IMODE(env_path.stat().st_mode) == 0o600)
        lines = env_path.read_text().splitlines()
        values = {'WINAMZ_SILENT_GRANT_CLIENT_IDS': 'winamz-launcher-spa,winamz-buyer-spa,winamz-seller-spa',
                  'WINAMZ_SILENT_GRANT_AUDIENCES': 'https://api.winamz.com',
                  'WINAMZ_SILENT_GRANT_ORIGINS': 'tauri://localhost,http://tauri.localhost,https://tauri.localhost'}
        lines = [line for line in lines if line.split('=', 1)[0] not in values]
        lines += [key + '=' + value for key, value in values.items()]
        write_private(env_path, '\n'.join(lines) + '\n')
        print('PASS private fixture and cloned allowlists prepared; no database writes')
    else:
        for path in [probe_path, private_path]:
            check(path.is_file() and not path.is_symlink() and stat.S_IMODE(path.stat().st_mode) == 0o600)
        fixture = json.loads(private_path.read_text())
        config = json.loads(probe_path.read_text())
        check(fixture['database'] == DB)
        ids = fixture['ids']
        check(all(len(value) == 21 and value.startswith('l144p') for value in ids.values()))
        check(fixture['username'].startswith('l144_probe_') and config['username'] == fixture['username'])
        user, org, role, org_role, user_role = [quote(ids[key]) for key in ['user', 'org', 'role', 'orgRole', 'userRole']]
        marker, username = quote(fixture['marker']), quote(fixture['username'])
        # Own only generated IDs with our exact marker; refuse collisions before any mutation.
        precondition = """do $$ begin
 if current_database()<>'logto_upgrade_144' then raise exception 'wrong database'; end if;
 if exists(select 1 from users where id=%s and (tenant_id<>'default' or username<>%s))
 or exists(select 1 from organizations where id=%s and (tenant_id<>'default' or name<>%s))
 or exists(select 1 from roles where id=%s and (tenant_id<>'default' or name<>%s))
 or exists(select 1 from organization_roles where id=%s and (tenant_id<>'default' or name<>%s))
 then raise exception 'fixture collision'; end if; end $$;""" % (user, username, org, marker, role, marker, org_role, marker)
        if ACTION == 'setup':
            check((BASE / 'clone-schema-gates.txt').is_file() and (BASE / 'clone-after.txt').is_file())
            body = """
insert into users(tenant_id,id,username,password_encrypted,password_encryption_method,password_updated_at,name)
 values('default',%s,%s,%s,'Argon2i',now(),%s) on conflict(id) do nothing;
insert into organizations(tenant_id,id,name) values('default',%s,%s) on conflict(id) do nothing;
insert into organization_user_relations values('default',%s,%s) on conflict do nothing;
insert into roles(tenant_id,id,name,description) values('default',%s,%s,'Isolated clone runtime probe') on conflict(id) do nothing;
insert into users_roles(tenant_id,id,user_id,role_id) values('default',%s,%s,%s) on conflict do nothing;
insert into roles_scopes(tenant_id,id,role_id,scope_id)
 select 'default',substr(md5(%s||s.id),1,21),%s,s.id from scopes s join resources r on r.id=s.resource_id and r.tenant_id=s.tenant_id
 where r.tenant_id='default' and r.indicator='https://api.winamz.com' on conflict do nothing;
insert into organization_roles(tenant_id,id,name,description) values('default',%s,%s,'Isolated clone runtime probe') on conflict(id) do nothing;
insert into organization_role_user_relations values('default',%s,%s,%s) on conflict do nothing;
insert into organization_role_resource_scope_relations
 select 'default',%s,s.id from scopes s join resources r on r.id=s.resource_id and r.tenant_id=s.tenant_id
 where r.tenant_id='default' and r.indicator='https://api.winamz.com' on conflict do nothing;
insert into organization_role_scope_relations select 'default',%s,id from organization_scopes where tenant_id='default' on conflict do nothing;
insert into application_access_control_user_relations(tenant_id,application_id,user_id)
 select 'default',id,%s from applications where tenant_id='default' and id in (%s,%s) on conflict do nothing;
""" % (user, username, quote(fixture['passwordHash']), marker, org, marker, org, user,
       role, marker, user_role, user, role, role, role, org_role, marker, org, org_role, user,
       org_role, org_role, user, quote(config['clientId']), quote(config['ssoClientId']))
        else:
            body = """delete from oidc_model_instances where tenant_id='default' and payload->>'accountId'=%s;
delete from users where tenant_id='default' and id=%s and username=%s;
delete from organizations where tenant_id='default' and id=%s and name=%s;
delete from roles where tenant_id='default' and id=%s and name=%s;
delete from organization_roles where tenant_id='default' and id=%s and name=%s;
""" % (user, user, username, org, marker, role, marker, org_role, marker)
        sql('begin;\n' + precondition + '\n' + body + '\ncommit;')
        print('PASS clone fixture ' + ACTION + '; production untouched')
except Exception:
    print('FAIL clone fixture ' + ACTION + ' at ' + STAGE + '; sensitive details suppressed', file=sys.stderr)
    sys.exit(1)
