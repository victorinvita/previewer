#!/bin/bash
# Arranca Previewer (si no está corriendo) y lo abre en el navegador.
# Uso: start.sh            → arranca y abre el navegador
#      start.sh --no-open  → solo arranca
source "$(dirname "$0")/common.sh"

if ! server_up; then
  if ! command -v node >/dev/null 2>&1; then
    alert "No encuentro Node.js. Instálalo desde nodejs.org y vuelve a abrir Previewer."
    open "https://nodejs.org"
    exit 1
  fi
  if ! ensure_built >>"$LOG" 2>&1; then
    alert "No se pudo preparar Previewer. Revisa el registro: $LOG"
    exit 1
  fi
  cd "$APP_ROOT" || exit 1
  nohup node node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$PORT" >>"$LOG" 2>&1 &
  for _ in $(seq 1 150); do
    server_up && break
    sleep 0.3
  done
  if ! server_up; then
    alert "El servidor de Previewer no arrancó. Revisa el registro: $LOG"
    exit 1
  fi
fi

[ "$1" = "--no-open" ] || open "$URL"
