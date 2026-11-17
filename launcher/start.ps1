# Previewer launcher: arranca el servidor local (si no está corriendo) y abre una pestaña nueva.
param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$Port = 47913
$Url = "http://127.0.0.1:$Port"
$Root = Split-Path -Parent $PSScriptRoot
$Log = Join-Path $PSScriptRoot 'server.log'
$NextBin = Join-Path $Root 'node_modules\next\dist\bin\next'

function Test-Port {
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $c.Dispose() }
}

function Show-Error($msg) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($msg, 'Previewer', 'OK', 'Error') | Out-Null
}

if (-not (Test-Port)) {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { Show-Error 'No encuentro Node.js instalado.'; exit 1 }

    # Recompila solo si el código cambió desde la última compilación.
    $buildId = Join-Path $Root '.next\BUILD_ID'
    $needsBuild = -not (Test-Path $buildId)
    if (-not $needsBuild) {
        $built = (Get-Item $buildId).LastWriteTime
        $newest = Get-ChildItem -Path (Join-Path $Root 'app'), (Join-Path $Root 'components'), (Join-Path $Root 'lib') -Recurse -File |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newest -and $newest.LastWriteTime -gt $built) { $needsBuild = $true }
    }
    if ($needsBuild) {
        $p = Start-Process -FilePath $node -ArgumentList "`"$NextBin`" build" -WorkingDirectory $Root `
            -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $Log -RedirectStandardError "$Log.err"
        if ($p.ExitCode -ne 0) { Show-Error "Falló la compilación. Revisa $Log.err"; exit 1 }
    }

    Start-Process -FilePath $node -ArgumentList "`"$NextBin`" start -H 127.0.0.1 -p $Port" -WorkingDirectory $Root `
        -WindowStyle Hidden -RedirectStandardOutput $Log -RedirectStandardError "$Log.err"

    $deadline = (Get-Date).AddSeconds(40)
    while (-not (Test-Port)) {
        if ((Get-Date) -gt $deadline) { Show-Error "El servidor no arrancó. Revisa $Log.err"; exit 1 }
        Start-Sleep -Milliseconds 300
    }
}

# Abre en el navegador predeterminado (pestaña nueva).
if (-not $NoOpen) { Start-Process $Url }
