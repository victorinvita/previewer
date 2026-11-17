# Previewer

App local para explorar y previsualizar footage de LucidLink sin cargar nada innecesario.
Corre en `http://127.0.0.1:47913` y se usa desde el navegador.

- Solo lee la unidad montada de LucidLink con permisos normales del sistema; nunca se conecta a LucidLink ni escribe en él.
- Las miniaturas y los fotogramas se guardan solo en este equipo.

## Windows

1. Abrir **PowerShell** (menú Inicio → escribir "PowerShell").
2. Pegar y pulsar Enter:
   ```powershell
   irm https://raw.githubusercontent.com/victorinvita/previewer/main/launcher/install.ps1 | iex
   ```
   Instala lo que falte (Node.js, Git y ffmpeg), descarga Previewer en tu carpeta de usuario, crea el acceso
   directo en el escritorio y en el menú Inicio, y lo abre en el navegador. Si Windows pide permiso, acéptalo.
3. En la app, pulsa **Rutas** (lápiz) y añade tu carpeta de LucidLink.

- Detener: `launcher/stop.ps1`.
- Generar vistas previas de una carpeta sin abrir la app: `launcher/generar-carpeta.ps1 "RUTA" [-Recurse]`.

## Mac

1. Instalar **Node.js LTS** desde [nodejs.org](https://nodejs.org).
2. Abrir la app **Terminal** y pegar:
   ```bash
   git clone https://github.com/victorinvita/previewer.git ~/Previewer && bash ~/Previewer/launcher/mac/install.sh
   ```
   El instalador prepara todo (incluido ffmpeg, sin pedir contraseña), crea **Previewer** en la carpeta
   Aplicaciones de tu usuario y lo abre en el navegador. Arrástralo al Dock para tenerlo a mano.

- Actualizar: `bash ~/Previewer/launcher/mac/update.sh`
- Detener: `bash ~/Previewer/launcher/mac/stop.sh`
- Generar vistas previas de una carpeta sin abrir la app: `bash ~/Previewer/launcher/mac/generar-carpeta.sh "/Volumes/…/CARPETA" [--recurse]`
- La primera vez macOS puede pedir permiso para acceder a `/Volumes` (LucidLink): acéptalo.

## Actualizar

En la app, el botón de flechas circulares (arriba a la derecha) busca si hay versión nueva. Solo actualiza
si pulsas **Actualizar ahora**: la app se cierra un momento y vuelve sola. Si algo falla, se queda con la
versión anterior (registro en `launcher/update.log`). Rutas, pins y vistas previas se conservan.

## Dónde se guardan los datos

Rutas, pins, preferencias y miniaturas viven solo en este equipo:

- Windows: `%LOCALAPPDATA%\Previewer`
- Mac: `~/Library/Application Support/Previewer`

## Desarrollo

Cada cambio subido a GitHub se compila y se prueba en Windows y en Mac (pestaña **Actions**).
La prueba es `scripts/smoke.mjs` y se puede ejecutar en local tras `npm run build`.
