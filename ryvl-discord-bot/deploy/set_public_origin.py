#!/usr/bin/env python3
"""Update only public URLs in the VM environment; never print or rotate secrets."""
import argparse
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit


def update_file(path: Path, origin: str, backup_dir: Path) -> bool:
    """Back up and atomically replace a regular, current-user-owned .env file."""
    parsed = urlsplit(origin)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ('', '/')):
        raise ValueError('The public origin must be an HTTPS origin without credentials, path or query')
    origin = origin.rstrip('/')
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid():
        raise ValueError('Expected an existing, non-symlink .env owned by the deployment user')

    original = path.read_bytes()
    newline = b'\r\n' if b'\r\n' in original else b'\n'
    values = {
        b'FRONTEND_URL': origin.encode(),
        b'DISCORD_OAUTH_REDIRECT_URI': (origin + '/api/auth/discord/callback').encode(),
    }
    # The application no longer needs WEB_BASE_URL, but do not leave a stale
    # public URL behind in environments that already contain this legacy key.
    if re.search(rb'(?m)^\s*(?:export\s+)?WEB_BASE_URL\s*=', original):
        values[b'WEB_BASE_URL'] = origin.encode()
    seen = set()
    output = []
    for line in original.splitlines(keepends=True):
        match = re.match(rb'^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=', line)
        key = match.group(1) if match else None
        if key in values:
            if key not in seen:
                output.append(key + b'=' + values[key] + newline)
                seen.add(key)
        else:
            output.append(line)  # Preserve unrelated credentials/comments byte-for-byte.
    updated = b''.join(output)
    missing = [key for key in values if key not in seen]
    if missing and updated and not updated.endswith((b'\n', b'\r')):
        updated += newline
    for key in missing:
        updated += key + b'=' + values[key] + newline
    if updated == original:
        path.chmod(0o600)
        return False

    # Backups live outside the Git checkout and are private to the SSH user.
    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    if backup_dir.is_symlink() or backup_dir.stat().st_uid != os.getuid():
        raise ValueError('Backup directory must be owned by the deployment user and not a symlink')
    backup_dir.chmod(0o700)
    backup_fd, _ = tempfile.mkstemp(prefix='env-', dir=backup_dir)
    with os.fdopen(backup_fd, 'wb') as backup:
        backup.write(original)
        backup.flush()
        os.fsync(backup.fileno())
    fd, temporary = tempfile.mkstemp(prefix='.env-public-origin-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('env_file', type=Path)
    parser.add_argument('--origin', default='https://ryvl.top')
    parser.add_argument('--backup-dir', type=Path, required=True)
    args = parser.parse_args()
    changed = update_file(args.env_file, args.origin, args.backup_dir)
    print('Public URL settings updated; other settings preserved.' if changed
          else 'Public URL settings already correct.')
