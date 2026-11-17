#!/bin/bash
# Instalador de Previewer para Mac.
#
# - Si ya tienes la carpeta del proyecto, ejecútalo desde ahí:   bash launcher/mac/install.sh
# - Si no, descarga Previewer en ~/Previewer y lo prepara.
#
# Crea "Previewer" en tu carpeta Aplicaciones (~/Applications). Como se crea en tu propio Mac,
# macOS no muestra el aviso de Gatekeeper. No pide contraseña de administrador.
set -e
REPO_URL="${PREVIEWER_REPO:-https://github.com/victorinvita/previewer.git}"
DEST="${PREVIEWER_DIR:-$HOME/Previewer}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# 1) Node.js
if ! command -v node >/dev/null 2>&1; then
  say "Falta Node.js. Se abrirá nodejs.org: instala la versión LTS y vuelve a ejecutar este instalador."
  open "https://nodejs.org"
  exit 1
fi
echo "Node.js $(node -v) ✓"

# 2) Código de Previewer
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/../../package.json" ] && grep -q '"name": "previewer"' "$HERE/../../package.json"; then
  APP_ROOT="$(cd "$HERE/../.." && pwd)"
  echo "Usando la copia existente en $APP_ROOT ✓"
else
  APP_ROOT="$DEST"
  if [ -d "$APP_ROOT/.git" ]; then
    say "Actualizando Previewer en $APP_ROOT…"
    git -C "$APP_ROOT" pull --ff-only
  else
    if ! xcode-select -p >/dev/null 2>&1; then
      say "macOS necesita sus herramientas de desarrollo (git). Acepta la ventana que aparece y vuelve a ejecutar este instalador."
      xcode-select --install || true
      exit 1
    fi
    say "Descargando Previewer en $APP_ROOT…"
    git clone "$REPO_URL" "$APP_ROOT"
  fi
fi

source "$APP_ROOT/launcher/mac/common.sh"
chmod +x "$APP_ROOT"/launcher/mac/*.sh

# 3) Dependencias, ffmpeg y compilación
say "Preparando Previewer (puede tardar unos minutos la primera vez)…"
cd "$APP_ROOT"
npm ci --no-audit --no-fund
ensure_ffmpeg
npx next build

# 4) App "Previewer" en ~/Applications con su icono
say "Creando la app Previewer…"
APP="$HOME/Applications/Previewer.app"
mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -o "$APP" -e "do shell script \"/bin/bash '$APP_ROOT/launcher/mac/start.sh' > /dev/null 2>&1 &\""

ICONSET="$(mktemp -d)/previewer.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256; do
  sips -z $s $s "$APP_ROOT/launcher/previewer.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  [ $d -le 256 ] && sips -z $d $d "$APP_ROOT/launcher/previewer.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
if iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/applet.icns" 2>/dev/null; then
  touch "$APP"
fi

say "Listo ✓"
echo "Previewer está en tu carpeta Aplicaciones (~/Applications)."
echo "Arrástralo al Dock para tenerlo a mano. Se abrirá ahora en tu navegador."
open -R "$APP" || true
"$APP_ROOT/launcher/mac/start.sh"
