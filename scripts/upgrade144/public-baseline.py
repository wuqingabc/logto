#!/usr/bin/env python3
"""Read-only public auth/console and Core health evidence, without response secrets."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.parse
import urllib.request


def fetch(url):
    assert urllib.parse.urlsplit(url).hostname in ('auth.winamz.com', 'console.winamz.com')
    with urllib.request.urlopen(url, timeout=20) as response:
        return response.status, response.read()


def main(folder):
    os.umask(0o077)
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    discovery_status, discovery_body = fetch('https://auth.winamz.com/oidc/.well-known/openid-configuration')
    discovery = json.loads(discovery_body.decode())
    assert discovery['issuer']=='https://auth.winamz.com/oidc'
    jwks_status, jwks_body = fetch(discovery['jwks_uri'])
    jwks = json.loads(jwks_body.decode())
    assert jwks['keys'] and not any('d' in key for key in jwks['keys'])
    console_status, unused = fetch('https://console.winamz.com/')
    health_body = subprocess.check_output(['docker','exec','winamz-core','wget','-qO-',
        'http://localhost:4200/api/v1/health'],timeout=20)
    core_state = subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}',
        'winamz-core'],timeout=20).decode().strip()
    assert core_state=='healthy'
    (folder/'discovery.json').write_bytes(discovery_body)
    (folder/'jwks.json').write_bytes(jwks_body)
    # Health response remains private; only its digest is reported.
    (folder/'core-health.json').write_bytes(health_body)
    evidence = dict(discovery_http=discovery_status,discovery_sha256=hashlib.sha256(discovery_body).hexdigest(),
        jwks_http=jwks_status,jwks_sha256=hashlib.sha256(jwks_body).hexdigest(),
        jwks_canonical_sha256=hashlib.sha256(json.dumps(jwks,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
        jwks_key_count=len(jwks['keys']),console_http=console_status,core_container_health=core_state,
        core_health_sha256=hashlib.sha256(health_body).hexdigest())
    (folder/'public-baseline.json').write_text(json.dumps(evidence,sort_keys=True,indent=2)+'\n')
    print(json.dumps(evidence,sort_keys=True))


if __name__=='__main__':main(Path(sys.argv[1]))
