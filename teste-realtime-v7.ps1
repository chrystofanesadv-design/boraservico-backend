$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE REALTIME V7"
Write-Host "========================================="

Invoke-RestMethod "$API/realtime"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod "$API/tracking"
Invoke-RestMethod "$API/timeline"
Invoke-RestMethod "$API/chat"

Write-Host "========================================="
Write-Host "TESTE REALTIME V7 FINALIZADO"
Write-Host "========================================="
