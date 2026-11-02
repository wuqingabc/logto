#!/usr/bin/env python3
"""Run as root on DB host. Emit counts only, never URLs or configuration values."""
import collections, ipaddress, json, socket, subprocess, urllib.parse
counts = collections.Counter()
queries = {
    'app_metadata': 'select jsonb_build_array(oidc_client_metadata,custom_client_metadata,protected_app_metadata) from applications',
    'connector': 'select config from connectors',
    'sso': 'select config from sso_connectors',
    'hook': 'select to_jsonb(h) from hooks h',
}
def walk(value):
    if isinstance(value, dict):
        for v in value.values(): yield from walk(v)
    elif isinstance(value,list):
        for v in value: yield from walk(v)
    elif isinstance(value,str) and '://' in value:
        try:
            url=urllib.parse.urlsplit(value)
            if url.hostname: yield url
        except ValueError: pass
for source,query in queries.items():
    raw=subprocess.check_output(['sudo','-u','postgres','psql','-X','-At','-d','logto','-c',query],universal_newlines=True)
    for line in raw.splitlines():
        for url in walk(json.loads(line)):
            if url.scheme not in ('http','https'):
                counts[source+':custom_scheme']+=1; continue
            host=url.hostname
            try:
                addresses=[ipaddress.ip_address(host)]
            except ValueError:
                try: addresses=list({ipaddress.ip_address(row[4][0]) for row in socket.getaddrinfo(host,None)})
                except socket.gaierror:
                    counts[source+':dns_unresolved']+=1; continue
            counts[source+(':private_or_special_destination' if any(not a.is_global for a in addresses) else ':public_destination')]+=1
print(json.dumps(dict(sorted(counts.items())),sort_keys=True))
