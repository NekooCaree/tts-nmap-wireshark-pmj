#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# EDU ONLY: menghentikan semua mode memakai identitas proyek yang sama.
# Tidak menyentuh image/container/cache milik proyek Docker lain.
# Placeholder hanya untuk parsing overlay; reset tidak menjalankan gateway baru.
export DESKTOP_PASSWORD="${DESKTOP_PASSWORD:-reset-only-placeholder}"
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.capture.yml -f docker-compose.desktop.yml --profile capture --profile desktop down --volumes --remove-orphans --rmi local
printf 'Container, network, volume, dan image lokal proyek lab dibersihkan.\n'
