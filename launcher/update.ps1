# Actualiza Previewer a la ultima version de GitHub y lo vuelve a abrir.
# Lo lanza el boton "Buscar actualizaciones" de la app (o se puede ejecutar a mano).
# Si algo falla, vuelve a la version anterior para que la app siga funcionando.
# Rutas, pins y vistas previas no se tocan (viven en %LOCALAPPDATA%\Previewer).
param([switch]$NoOpen)
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$Log = Join-Path $PSScriptRoot 'update.log'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
Set-Location $Root

function Log($msg) { Add-Content -Path $Log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) -Encoding UTF8 }
# Los comandos externos van por cmd para que sus avisos (stderr) no se traten como errores de PowerShell.
function Run($cmd) {
    Log "> $cmd"
    cmd /c "$cmd >> `"$Log`" 2>&1"
    return ($LASTEXITCODE -eq 0)
}
function LockHash { if (Test-Path 'package-lock.json') { (Get-FileHash 'package-lock.json').Hash } else { '' } }
function Prepare($lockBefore) {
    if (((LockHash) -ne $lockBefore) -or -not (Test-Path 'node_modules\next')) {
        if (-not (Run 'npm ci --no-audit --no-fund')) { return $false }
    }
    return (Run 'node node_modules\next\dist\bin\next build')
}

Set-Content -Path $Log -Value '' -Encoding UTF8
Log 'Actualizando Previewer'
& (Join-Path $PSScriptRoot 'stop.ps1')
Start-Sleep -Seconds 1

$before = (git rev-parse HEAD).Trim()
$lock = LockHash
$ok = (Run 'git pull --ff-only origin main') -and (Prepare $lock)
if (-not $ok) {
    Log "Fallo la actualizacion: se vuelve a la version anterior ($before)"
    $lockNew = LockHash
    Run "git reset --hard $before" | Out-Null
    Prepare $lockNew | Out-Null
} else {
    Log ('Actualizado a ' + (git rev-parse --short HEAD))
}

$start = Join-Path $PSScriptRoot 'start.ps1'
if ($NoOpen) { & $start -NoOpen } else { & $start }
Log 'Listo'
