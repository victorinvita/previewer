# Instalador de Previewer para Windows.
#
# Uso (pegar en PowerShell):
#   irm https://raw.githubusercontent.com/victorinvita/previewer/main/launcher/install.ps1 | iex
#
# Instala lo que falte (Node.js, Git y ffmpeg con winget), descarga Previewer en %USERPROFILE%\Previewer,
# lo prepara, crea accesos directos en el escritorio y el menu Inicio, y lo abre en el navegador.
# Si ya estaba instalado, lo actualiza. No necesita permisos de administrador para Previewer en si.
$ErrorActionPreference = 'Stop'
$RepoUrl = if ($env:PREVIEWER_REPO) { $env:PREVIEWER_REPO } else { 'https://github.com/victorinvita/previewer.git' }
$Dest = if ($env:PREVIEWER_DIR) { $env:PREVIEWER_DIR } else { Join-Path $HOME 'Previewer' }

function Say($msg) { Write-Host ''; Write-Host $msg -ForegroundColor Cyan }
function Fail($msg) { Write-Host ''; Write-Host $msg -ForegroundColor Red; throw 'Instalacion detenida.' }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
# Tras instalar con winget, la ventana actual no ve los programas nuevos: se recarga el PATH.
function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}
function Native($exe, [string[]]$argList) {
    # git y npm escriben avisos normales en stderr: no deben detener la instalacion.
    $ErrorActionPreference = 'Continue'
    & $exe @argList 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Fail "Fallo: $exe $($argList -join ' ')" }
}

# 1) Programas necesarios
$needs = @()
# Next.js necesita Node 20 o más nuevo: si hay uno más antiguo, se instala el LTS.
$nodeOld = (Has 'node') -and ([int]((node -v) -replace '^v(\d+).*', '$1') -lt 20)
if (-not (Has 'node') -or $nodeOld) { $needs += @{ id = 'OpenJS.NodeJS.LTS'; name = 'Node.js' } }
if (-not (Has 'git')) { $needs += @{ id = 'Git.Git'; name = 'Git' } }
if (-not (Has 'ffmpeg')) { $needs += @{ id = 'Gyan.FFmpeg'; name = 'ffmpeg' } }
if ($needs.Count) {
    if (-not (Has 'winget')) {
        Fail 'Falta "App Installer" (winget). Instalalo desde Microsoft Store y vuelve a ejecutar este comando.'
    }
    foreach ($n in $needs) {
        Say "Instalando $($n.name)... (si Windows pide permiso, acepta)"
        & winget install --id $n.id -e --silent --accept-source-agreements --accept-package-agreements
    }
    Refresh-Path
    foreach ($c in 'node', 'git', 'ffmpeg') {
        if (-not (Has $c)) { Fail "No se pudo instalar $c. Cierra esta ventana, abre PowerShell de nuevo y repite el comando." }
    }
}
Write-Host "Node.js $(node -v) / $(git --version) / ffmpeg OK" -ForegroundColor Green

# 2) Codigo de Previewer
$env:GIT_TERMINAL_PROMPT = '0'
if (Test-Path (Join-Path $Dest '.git')) {
    Say "Actualizando Previewer en $Dest..."
    & (Join-Path $Dest 'launcher\stop.ps1') 2>$null
    Native 'git' @('-C', $Dest, 'pull', '--ff-only', 'origin', 'main')
} else {
    if (Test-Path $Dest) { Fail "Ya existe la carpeta $Dest y no es una instalacion de Previewer. Renombrala y repite." }
    Say "Descargando Previewer en $Dest..."
    Native 'git' @('clone', $RepoUrl, $Dest)
}

# 3) Dependencias y compilacion
Say 'Preparando Previewer (la primera vez tarda unos minutos)...'
Push-Location $Dest
try {
    Native 'npm.cmd' @('ci', '--no-audit', '--no-fund')
    Native 'node' @('node_modules\next\dist\bin\next', 'build')
} finally { Pop-Location }

# 4) Accesos directos (escritorio y menu Inicio)
Say 'Creando accesos directos...'
$shell = New-Object -ComObject WScript.Shell
$places = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) '')
)
foreach ($dir in $places) {
    $lnk = $shell.CreateShortcut((Join-Path $dir 'Previewer.lnk'))
    $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $lnk.Arguments = '"' + (Join-Path $Dest 'launcher\Previewer.vbs') + '"'
    $lnk.WorkingDirectory = $Dest
    $lnk.IconLocation = Join-Path $Dest 'launcher\previewer.ico'
    $lnk.Description = 'Previewer'
    $lnk.Save()
}

Say 'Listo. Previewer esta en tu escritorio y en el menu Inicio. Se abre ahora en el navegador.'
& (Join-Path $Dest 'launcher\start.ps1')
