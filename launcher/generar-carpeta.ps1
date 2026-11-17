# Genera miniaturas y fotogramas de una carpeta en segundo plano, sin abrir el navegador.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File generar-carpeta.ps1 "C:\Volumes\Empresa\Proyectos\Cliente\Rodaje01"
#   powershell -ExecutionPolicy Bypass -File generar-carpeta.ps1 "C:\Volumes\Empresa\Proyectos\Cliente" -Recurse
#
# La carpeta debe estar dentro de alguna ruta guardada en Previewer.
# El trabajo lo hace el servidor local de Previewer: sigue aunque cierres esta ventana,
# y se ve el progreso en la app (arriba a la derecha).
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Path,
    [switch]$Recurse
)
$ErrorActionPreference = 'Stop'
$Url = 'http://127.0.0.1:47913'

# Arranca el servidor si no está corriendo (sin abrir el navegador).
& (Join-Path $PSScriptRoot 'start.ps1') -NoOpen

$body = @{ path = (Resolve-Path -LiteralPath $Path).Path; recursive = [bool]$Recurse } | ConvertTo-Json
try {
    $res = Invoke-RestMethod -Method Post -Uri "$Url/api/jobs" -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes($body))
    $j = $res.job
    Write-Host ("En cola: {0} - {1} archivos - {2:N1} GB" -f $j.title, $j.total, ($j.totalBytes / 1GB))
    Write-Host "Puedes cerrar esta ventana. El progreso se ve en Previewer."
} catch {
    $msg = $_.ErrorDetails.Message
    if ($msg) { $msg = ($msg | ConvertFrom-Json).error } else { $msg = $_.Exception.Message }
    Write-Host "No se pudo iniciar: $msg" -ForegroundColor Red
    exit 1
}
