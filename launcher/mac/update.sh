#!/bin/bash
# Actualiza Previewer a la última versión de GitHub y lo vuelve a abrir.
# Lo lanza el botón "Buscar actualizaciones" de la app (con --no-open) o se puede ejecutar a mano.
# Si algo falla, vuelve a la versión anterior para que la app siga funcionando.
# Las rutas, pins y vistas previas se conservan (viven fuera de esta carpeta).
source "$(dirname "$0")/common.sh"
cd "$APP_ROOT" || exit 1
export GIT_TERMINAL_PROMPT=0

# Desde la app no hay Terminal: todo va al registro.
if [ "$1" = "--no-open" ]; then
  exec >"$APP_ROOT/launcher/update.log" 2>&1
fi

if [ ! -d .git ]; then
  echo "Esta copia no se instaló con git: vuelve a ejecutar el instalador para actualizar."
  exit 1
fi

"$APP_ROOT/launcher/mac/stop.sh" || true
sleep 1

lock_hash() { shasum package-lock.json 2>/dev/null; }
prepare() {
  if [ "$(lock_hash)" != "$1" ] || [ ! -d node_modules/next ]; then
    npm ci --no-audit --no-fund || return 1
  fi
  ensure_ffmpeg && npx next build
}

BEFORE="$(git rev-parse HEAD)"
LOCK="$(lock_hash)"
if git pull --ff-only origin main && prepare "$LOCK"; then
  echo "Actualizado a $(git rev-parse --short HEAD)."
else
  echo "Falló la actualización: se vuelve a la versión anterior ($BEFORE)."
  LOCK_NEW="$(lock_hash)"
  git reset --hard "$BEFORE"
  prepare "$LOCK_NEW"
fi

"$APP_ROOT/launcher/mac/start.sh" "$1"
