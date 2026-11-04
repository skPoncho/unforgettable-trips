#!/bin/sh
# node_modules vive en un volumen de Docker que no se actualiza al reconstruir la imagen.
# Si package-lock.json cambió desde la última instalación, reinstala antes de arrancar.
set -e

if ! sha256sum -c node_modules/.lock-hash >/dev/null 2>&1; then
  echo "package-lock.json cambió: instalando dependencias…"
  npm ci
  sha256sum package-lock.json > node_modules/.lock-hash
fi

exec "$@"
