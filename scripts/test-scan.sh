#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
nmap_command=nmap
if ! command -v "$nmap_command" >/dev/null 2>&1; then
  if command -v nmap.exe >/dev/null 2>&1; then
    nmap_command=nmap.exe
  elif [[ -x '/c/Program Files (x86)/Nmap/nmap.exe' ]]; then
    nmap_command='/c/Program Files (x86)/Nmap/nmap.exe'
  else
    printf 'WARNING: Nmap belum tersedia. Install Nmap resmi, lalu ulangi make test.\n' >&2
    exit 1
  fi
fi
target="${1:-127.0.0.1}"
ports="${SCAN_PORTS:-21,22,23,25,3306,6379,8080,27017}"
if [[ -t 1 ]]; then printf '\033[36mScan layanan lab %s:%s\033[0m\n' "$target" "$ports"; fi
# -sV menjalankan probe aplikasi, bukan sekadar menebak nama dari nomor port.
"$nmap_command" -sV -p "$ports" "$target"
