#!/bin/bash
# Funciones compartidas por los scripts de Mac. No se ejecuta solo: lo cargan los demás.

# Al abrir desde el Dock, macOS no carga el PATH de la Terminal: se añaden las rutas habituales.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT=47913
URL="http://127.0.0.1:$PORT"
LOG="$APP_ROOT/launcher/server.log"

alert() {
  osascript -e "display alert \"Previewer\" message \"$1\"" >/dev/null 2>&1 || echo "Previewer: $1"
}

server_up() {
  curl -s -o /dev/null --max-time 1 "$URL/api/routes"
}

# ffmpeg: si no está en el sistema (Homebrew), se descarga una copia dentro de la app.
# No pide contraseña ni instala nada fuera de la carpeta de Previewer.
ensure_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    return 0
  fi
  echo "Preparando ffmpeg dentro de Previewer…"
  (cd "$APP_ROOT" && npm install --no-save --no-audit --no-fund ffmpeg-static ffprobe-static)
}

# Instala dependencias y compila si el código cambió desde la última vez.
ensure_built() {
  cd "$APP_ROOT" || return 1
  if [ ! -d node_modules/next ]; then
    npm ci --no-audit --no-fund || return 1
    ensure_ffmpeg || return 1
  fi
  if [ ! -f .next/BUILD_ID ] || [ -n "$(find app components lib -type f -newer .next/BUILD_ID 2>/dev/null | head -1)" ]; then
    npx next build || return 1
  fi
}
