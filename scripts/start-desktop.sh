#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker info >/dev/null
python3 - <<'PY'
from pathlib import Path
import re
import secrets
config = Path('.env')
text = config.read_text() if config.exists() else Path('.env.example').read_text()
def get(name, default=''):
    match = re.search(r'^' + name + r'=([^\r\n]*)', text, re.M)
    return match.group(1).strip() if match else default
user = get('DESKTOP_USER', 'praktikum')
if not re.fullmatch(r'[a-zA-Z0-9_-]+', user):
    raise SystemExit('DESKTOP_USER hanya huruf, angka, _ dan -')
password = get('DESKTOP_PASSWORD') or secrets.token_urlsafe(18)
for name, value in [('DESKTOP_USER', user), ('DESKTOP_PASSWORD', password)]:
    pattern = '^' + name + r'=[^\r\n]*'
    if re.search(pattern, text, re.M):
        text = re.sub(pattern, name + '=' + value, text, flags=re.M)
    else:
        text += '\n' + name + '=' + value + '\n'
config.write_text(text)
config.chmod(0o600)
Path('.runtime').mkdir(exist_ok=True)
Path('.runtime/akses-desktop.txt').write_text(
    f'DESKTOP PRAKTIKUM (satu layar bersama)\nURL lokal: http://127.0.0.1:{get("DESKTOP_PORT", "6080")}\n'
    f'Username: {user}\nPassword: {password}\nTarget: 172.31.250.10\n')
Path('.runtime/akses-desktop.txt').chmod(0o600)
PY
docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop up -d --build --wait --wait-timeout 180
cat .runtime/akses-desktop.txt
printf '\nUntuk internet: ngrok http http://127.0.0.1:6080\n'
