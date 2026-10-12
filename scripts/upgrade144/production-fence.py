#!/usr/bin/env python3
"""Install/verify/restore exactly the two Logto TLS ingress maintenance fences."""
import os
from pathlib import Path
import re
import sys

HOSTS = ('auth.winamz.com', 'console.winamz.com')
FENCE = '\n    # winamz-logto144-writer-fence\n    if ($remote_addr != 127.0.0.1) { return 503; }\n'


def inject(text):
    assert 'winamz-logto144-writer-fence' not in text, 'Fence already installed'
    candidates = []
    for match in re.finditer(r'(?m)^\s*server\s*\{', text):
        opening = match.end()-1
        depth, quote, comment, escaped = 1, None, False, False
        for index in range(opening+1, len(text)):
            ch = text[index]
            if comment:
                if ch == '\n': comment = False
                continue
            if escaped:
                escaped = False
                continue
            if ch == '\\':
                escaped = True
                continue
            if quote:
                if ch == quote: quote = None
                continue
            if ch in ('"', "'"):
                quote = ch
                continue
            if ch == '#':
                comment = True
                continue
            if ch == '{': depth += 1
            elif ch == '}': depth -= 1
            if depth == 0:
                block = text[opening+1:index]
                if re.search(r'(?m)^\s*listen\s+(?:[^;\s]+:)?443\s+ssl\b', block):
                    candidates.append(opening)
                break
        else:
            raise AssertionError('Unclosed server block')
    assert len(candidates) == 1, 'Expected exactly one TLS443 server per vhost'
    opening = candidates[0]
    return text[:opening+1] + FENCE + text[opening+1:]


def write_atomic(path, value, mode):
    temporary = path.with_name(path.name+'.logto144.tmp')
    fd = os.open(str(temporary), os.O_WRONLY|os.O_CREAT|os.O_EXCL, mode)
    with os.fdopen(fd, 'w') as target:
        target.write(value)
    os.replace(str(temporary), str(path))


def main(action, release):
    assert action in ('install', 'verify', 'restore')
    assert str(release).startswith('/srv/winamz/backups/logto144-') and release.name.startswith('final-')
    for host in HOSTS:
        path = Path('/etc/nginx/vhost')/(host+'.conf')
        assert path.is_file() and not path.is_symlink(), 'Unexpected nginx vhost path'
        original = release/('original-nginx-'+host+'.conf')
        if action == 'install':
            assert not original.exists(), 'Original nginx backup already exists'
            text = path.read_text()
            fenced = inject(text)
            write_atomic(original, text, 0o600)
            write_atomic(path, fenced, path.stat().st_mode & 0o777)
        else:
            text = original.read_text()
            assert path.read_text() == inject(text), 'Nginx fence drift: inspect before replacing'
            if action == 'restore':
                write_atomic(path, text, path.stat().st_mode & 0o777)


if __name__ == '__main__':
    assert len(sys.argv) == 3, 'Usage: production-fence.py install|verify|restore FINAL_RELEASE_DIR'
    main(sys.argv[1], Path(sys.argv[2]))
