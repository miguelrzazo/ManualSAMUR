#!/usr/bin/env python3
"""Store this application's GitHub OAuth credentials privately with Wrangler."""
import getpass
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]

def main():
    print('Register an OAuth app at https://github.com/settings/applications/new')
    print('Name: Manual SAMUR · Administración')
    print('Homepage: https://manualsamur.apta-academy.com')
    print('Callback: https://manualsamur.apta-academy.com/auth/github/callback')
    print('No repository permissions or paid services are required.')
    client_id = input('Client ID: ').strip()
    secret = getpass.getpass('Client secret (hidden): ').strip()
    email = input('Owner verified GitHub email [miguelrzazo13@gmail.com]: ').strip() or 'miguelrzazo13@gmail.com'
    if not client_id or not secret or '@' not in email:
        raise SystemExit('Missing OAuth configuration. No changes made.')
    with tempfile.TemporaryDirectory(prefix='manualsamur-oauth-') as directory:
        file = Path(directory) / 'secrets.json'
        file.write_text(json.dumps({'GITHUB_CLIENT_ID': client_id, 'GITHUB_CLIENT_SECRET': secret, 'EDITOR_EMAIL': email}))
        file.chmod(0o600)
        env = {**os.environ, 'WRANGLER_LOG_PATH': str(Path(directory) / 'wrangler.log')}
        subprocess.run(['node', 'node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', str(file), '--env', 'production'], cwd=ROOT, env=env, check=True)
    print('GitHub login configured. Open https://manualsamur.apta-academy.com/admin to verify your identity.')

if __name__ == '__main__':
    main()
