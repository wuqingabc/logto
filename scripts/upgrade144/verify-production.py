#!/usr/bin/env python3
"""Local HTTPS acceptance under the public maintenance fence; never print credentials."""
import base64
import json
import subprocess
import sys
import urllib.parse
from pathlib import Path


def curl(path, data=None, headers=None, expected=200, method=None, response_headers=None):
    config = [
        'silent', 'show-error', 'max-time = 20', 'noproxy = "*"',
        'resolve = "auth.winamz.com:443:127.0.0.1"',
        'url = ' + json.dumps('https://auth.winamz.com' + path),
        'write-out = "\\n%{http_code}"',
    ]
    if response_headers:
        config.append('dump-header = "-"')
    if method:
        config.append('request = ' + json.dumps(method))
    for name, value in (headers or {}).items():
        config.append('header = ' + json.dumps(name + ': ' + value))
    if data is not None:
        config.append('data = ' + json.dumps(data))
    result = subprocess.run(['curl', '--config', '-'], input=('\n'.join(config)+'\n').encode(),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert result.returncode == 0, 'Local HTTPS request failed'
    body, status = result.stdout.rsplit(b'\n', 1)
    assert int(status) == expected, 'Unexpected status at ' + path.split('?')[0]
    if response_headers:
        header_block, separator, body = body.partition(b'\r\n\r\n')
        assert separator, 'Response headers missing'
        parsed = dict(line.decode().split(':', 1) for line in header_block.split(b'\r\n')[1:] if b':' in line)
        parsed = dict((name.lower(), value.strip()) for name, value in parsed.items())
        for name, value in response_headers.items():
            assert parsed.get(name.lower()) == value, 'Unexpected CORS headers'
    return body


try:
    release = Path(sys.argv[1])
    assert (release / 'migration-gates.passed').is_file()
    assert (release / 'public-fence.verified').is_file()
    assert not (release / 'writers-resumed').exists()
    discovery = json.loads(curl('/oidc/.well-known/openid-configuration'))
    assert discovery['issuer'] == 'https://auth.winamz.com/oidc'
    assert discovery['token_endpoint'] == 'https://auth.winamz.com/oidc/token'
    jwks = json.loads(curl('/oidc/jwks'))
    assert jwks == json.loads((release.parent / 'public-before' / 'jwks.json').read_text()), 'Signing keys changed'
    original = json.loads((release / 'original-core-container.json').read_text())[0]
    env = dict(line.split('=', 1) for line in original['Config']['Env'] if '=' in line)
    resource = subprocess.check_output([
        'sudo', '-u', 'postgres', 'psql', '-X', '-At', '-d', 'logto', '-c',
        "select indicator from resources where tenant_id='default' and indicator like '%.logto.app/api' order by indicator limit 1"
    ]).decode().strip()
    assert resource.startswith('https://') and resource.endswith('.logto.app/api')
    basic = base64.b64encode((env['LOGTO_M2M_APP_ID'] + ':' + env['LOGTO_M2M_APP_SECRET']).encode()).decode()
    token = json.loads(curl('/oidc/token', urllib.parse.urlencode({
        'grant_type': 'client_credentials', 'resource': resource, 'scope': 'all'
    }), {'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded'}))
    assert token.get('access_token') and token.get('expires_in', 0) > 0
    headers = {'Authorization': 'Bearer ' + token['access_token']}
    for route in ['/api/users?page=1&page_size=10', '/api/organizations',
                  '/api/winamz/agents', '/api/winamz/grants', '/api/winamz/audit']:
        json.loads(curl(route, headers=headers))
    curl('/api/users', expected=401)
    curl('/api/internal/silent-grant', data='{}', headers={
        'Content-Type': 'application/json', 'Origin': 'tauri://localhost'
    }, expected=401)
    curl('/api/internal/silent-grant', data='{}', headers=dict(headers, **{
        'Content-Type': 'application/json', 'Origin': 'tauri://localhost'
    }), expected=401)
    curl('/api/internal/silent-grant', headers={
        'Origin': 'tauri://localhost', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type'
    }, expected=204, method='OPTIONS', response_headers={
        'Access-Control-Allow-Origin': 'tauri://localhost',
        'Access-Control-Allow-Credentials': 'true'
    })
    (release / 'local-auth-gates.passed').touch(mode=0o600)
    print('Production local TLS, M2M, Management/WinAMZ APIs, unauthenticated rejection and desktop CORS acceptance passed.')
except Exception as error:
    print('Production acceptance failed; sensitive diagnostics suppressed', file=sys.stderr)
    sys.exit(1)
