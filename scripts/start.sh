#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --build --wait
printf 'TokoKu siap: http://127.0.0.1:8080 (atau WEB_PORT pada .env)\n'
