# Previewer — notas para Claude

App local (Next.js 16 App Router + React 19 + Tailwind v4 + TypeScript) para explorar y previsualizar
footage de LucidLink, como un iconik ligero. Se usa en el navegador en `http://127.0.0.1:47913` (puerto fijo).
El usuario escribe en español: responde en español, simple y corto.

## Reglas que no se rompen
- Nunca hablar con LucidLink (ni API, ni CLI, ni servicio, ni registro). Solo leer la unidad montada con
  acceso normal al sistema de archivos, y nunca escribir dentro de ella.
- Nada de copias ni importaciones del footage. Lo único que queda en local: miniaturas, fotogramas y config,
  en `APP_DIR` (`%LOCALAPPDATA%\Previewer` / `~/Library/Application Support/Previewer`).
- Al abrir una carpeta no se genera nada: `/api/cached` y `/api/thumb?cached=1` solo leen la caché.
  Solo se genera con el botón "Generar vistas previas" (trabajos en segundo plano).
- Fotogramas para scrub: 3 por segundo, máximo 300, 180 px de alto. El usuario prefiere ahorrar espacio:
  no proponer subir la resolución.
- Estilo de victorflames.com: crema `#f7f5f3`, tinta `#14211D`, acento `#e56b3b`, botones `diag-fill`,
  animaciones hero-rise/header-drop. Fuente: solo DM Sans (nada de serif ni monoespaciada).
- Iconos: logo de Windows/Finder = mostrar en el explorador del sistema; flecha en caja = abrir carpeta en la app;
  lápiz = rutas; chincheta = pins.

## Mapa del código
- `lib/platform.ts`: todo lo que depende del sistema (APP_DIR, ffmpeg `bin()`, mostrar en carpeta, selector
  de carpeta, `toRel`/`normRel`). Las rutas relativas siempre usan `/`.
- `lib/ffmpeg.ts` (probe, miniatura, onda, sprite `spritePlan`), `lib/cache.ts`, `lib/generate.ts`,
  `lib/queue.ts` (semáforos compartidos), `lib/jobs.ts` (trabajos persistidos en `jobs.json`, se reanudan
  desde `instrumentation.ts`), `lib/walk.ts`, `lib/pins.ts`, `lib/config.ts` (rutas).
- `lib/update.ts` + `app/api/update` + `components/UpdateButton.tsx`: actualizar solo al pulsar el botón
  (git pull, compila; si falla vuelve a la versión anterior). En Windows se lanza con wscript: un hijo de
  node sin `detached` muere con el servidor (job de libuv) y con `detached` PowerShell no arranca.
- `app/api/*`: routes, tree, search, list, meta, thumb, cached, jobs, pins, prefs, reveal, pick-folder.
- `components/`: Home (búsqueda), Browser + FolderListing + Entries (explorador), ViewControls
  (vista y orden multi‑columna), JobsIndicator, Pins, RoutesManager.
- `launcher/`: Windows (`install.ps1` instalador de un comando; `Previewer.vbs` → `start.ps1`, `stop.ps1`,
  `generar-carpeta.ps1`; `update.vbs` → `update.ps1`).
  `launcher/mac/`: `install.sh`, `start.sh`, `stop.sh`, `update.sh`, `generar-carpeta.sh`.

## Seguridad
- `proxy.ts` bloquea peticiones de otras webs y dominios que no sean 127.0.0.1/localhost. El servidor solo
  escucha en 127.0.0.1. Repo público: nunca subir rutas reales, nombres de clientes ni el email personal
  (este repo usa el email noreply de GitHub).

## Flujo de trabajo
- Repo único público: `github.com/victorinvita/previewer` (rama `main`). Lo que se sube sirve para Windows y Mac.
- GitHub Actions (`.github/workflows/build.yml`) compila y ejecuta `scripts/smoke.mjs` en windows-latest
  y macos-latest. `gh` está instalado (`C:/Program Files/GitHub CLI`): ver resultados con `gh run list`.
- `.gitignore` bloquea videos, fotos y audio: al repo solo va código (más el icono `launcher/previewer.png`).
- Probar en local: `npm run build` y luego `node scripts/smoke.mjs` (usa el puerto 47999 y datos temporales).
- Tras cambios, reiniciar el servidor del usuario: `launcher/stop.ps1` y `launcher/start.ps1 -NoOpen`
  (start.ps1 recompila si el código es más nuevo que `.next/BUILD_ID`).

## Pendiente (a 2026-11-10)
1. Hecho (2026-11-17): Actions sale verde en Windows y Mac.
2. Hecho (2026-11-17): repo público (historial reescrito en un solo commit con el email noreply; el
   historial viejo queda solo en local, rama `respaldo-antes-de-publicar`: nunca subirla). Falta la guía para la amiga de Mac.
3. Más adelante: lista de comprobación para la probadora de Mac y una función de diagnóstico en la app.
4. Ofrecido, sin respuesta: subir `cleanupPeriodDays` en la config de Claude Code para no perder chats,
   y actualizar el acceso directo del escritorio si se renombra la carpeta del proyecto.
