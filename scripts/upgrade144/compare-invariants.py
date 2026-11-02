#!/usr/bin/env python3
"""Protect legacy data; permit only exact management API seed additions."""
import sys
from collections import defaultdict


def read(path):
    rows = defaultdict(list)
    with open(path) as source:
        for line in source:
            if '|' in line:
                key, *values = line.strip().split('|')
                rows[key].append(tuple(values))
    return rows


def require(condition, message):
    if not condition:
        raise SystemExit('Invariant failed: ' + message)


def compare(before, after):
    require(before['capture_complete'] == [('1',)] and after['capture_complete'] == [('1',)],
            'incomplete snapshot')
    keys = ('users', 'applications', 'callbacks', 'connectors', 'sso_connectors',
            'tenant_ids', 'resources', 'roles', 'users_roles', 'logto_configs')
    for key in keys:
        require(len(before[key]) == 1 and before[key] == after[key], key)
    require(before['table_digest'] and set(before['table_digest']) == set(after['table_digest']),
            'organization/custom/session table contents')
    for key in ('invalid_index', 'unvalidated_constraint'):
        require(not after[key], key)
    missing_resources = {row[0] for row in before['seed_missing_resource']}
    new_scope_ids = set()
    for key in ('scope_row', 'role_scope_row'):
        old, new = set(before[key]), set(after[key])
        require(old <= new, 'existing ' + key + ' removed or modified')
        added_resources = set()
        for row in new - old:
            digest, resource, scope, kind = row
            require(kind == 'seed' and resource in missing_resources, 'unauthorized ' + key + ' addition')
            if key == 'scope_row':
                require(resource not in added_resources, 'duplicate added management all scope')
                added_resources.add(resource)
                new_scope_ids.add(scope)
            else:
                require(scope in new_scope_ids, 'role link did not reference a newly seeded scope')
    # Count and row evidence must agree; incomplete captures must fail closed.
    for snapshot in (before, after):
        require(len(snapshot['scope_count']) == 1 and
                int(snapshot['scope_count'][0][0]) == len(snapshot['scope_row']),
                'scope capture incomplete')
        require(len(snapshot['roles_scopes']) == 1 and
                int(snapshot['roles_scopes'][0][0]) == len(snapshot['role_scope_row']),
                'roles_scopes capture incomplete')
    require(len(after['snapshot_epoch']) == 1, 'missing snapshot time')
    cutoff = float(after['snapshot_epoch'][0][0])
    new_oidc = {row[0]: row for row in after['oidc_row']}
    for row in before['oidc_row']:
        identity, expiry, digest = row
        if expiry == 'never' or float(expiry) > cutoff:
            require(new_oidc.get(identity) == row, 'live OIDC payload/metadata changed or missing')


if __name__ == '__main__':
    require(len(sys.argv) == 3, 'usage: compare-invariants.py BEFORE AFTER')
    compare(read(sys.argv[1]), read(sys.argv[2]))
    print('Identity, organization/custom data, existing scope links and live OIDC invariants match; only valid seed additions allowed.')
