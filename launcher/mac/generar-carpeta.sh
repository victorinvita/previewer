#!/bin/bash
# Genera miniaturas y fotogramas de una carpeta en segundo plano, sin abrir el navegador.
# Uso: generar-carpeta.sh "/Volumes/…/CARPETA" [--recurse]
# La carpeta debe estar dentro de alguna ruta guardada en Previewer.
source "$(dirname "$0")/common.sh"

if [ -z "$1" ]; then
  echo "Uso: $0 \"/ruta/a/la/carpeta\" [--recurse]"
  exit 1
fi
TARGET="$(cd "$1" 2>/dev/null && pwd)" || { echo "No existe la carpeta: $1"; exit 1; }
RECURSE=false
[ "$2" = "--recurse" ] && RECURSE=true

"$APP_ROOT/launcher/mac/start.sh" --no-open || exit 1

BODY="$(node -e 'console.log(JSON.stringify({ path: process.argv[1], recursive: process.argv[2] === "true" }))' "$TARGET" "$RECURSE")"
RES="$(curl -s -X POST "$URL/api/jobs" -H "Content-Type: application/json" --data "$BODY")"
echo "$RES" | node -e '
let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
  const r = JSON.parse(s);
  if (r.job) console.log(`En cola: ${r.job.title} - ${r.job.total} archivos. Puedes cerrar esta ventana.`);
  else { console.log("No se pudo iniciar: " + r.error); process.exit(1); }
});'
