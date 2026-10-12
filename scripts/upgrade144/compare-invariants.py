#!/usr/bin/env python3
"""Require exact stable identities/config; seed replay changes reviewed separately."""
import sys

def read(path):
    return {s.split('|')[0]:s.strip() for s in open(path) if '|' in s and not s.startswith('oidc_live|')}
before,after=map(read,sys.argv[1:])
keys=('users','applications','callbacks','connectors','sso_connectors','tenant_ids','resources','roles','users_roles','logto_configs')
for key in keys:
    if before.get(key)!=after.get(key):
        raise SystemExit('Invariant failed: '+key)
for key in ('invalid_index','unvalidated_constraint'):
    if key in after: raise SystemExit('Schema integrity failed: '+key)
print('Stable identity/configuration invariants match; roles_scopes seed delta requires schema gate.')
