#!/bin/sh
set -eu
: "${DESKTOP_PASSWORD:?DESKTOP_PASSWORD wajib diisi}"
case "$DESKTOP_USER" in
  ''|*[!a-zA-Z0-9_-]*) echo 'DESKTOP_USER hanya boleh huruf, angka, _ dan -' >&2; exit 1;;
esac
umask 077
hash=$(printf '%s\n' "$DESKTOP_PASSWORD" | openssl passwd -apr1 -stdin)
printf '%s:%s\n' "$DESKTOP_USER" "$hash" > /tmp/desktop.htpasswd
unset DESKTOP_PASSWORD hash
exec nginx -c /opt/gateway/nginx.conf -g 'daemon off;'
