# Detiene el servidor de Previewer (puerto 47913).
$conn = Get-NetTCPConnection -LocalPort 47913 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conn) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
