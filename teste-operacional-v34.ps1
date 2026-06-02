$API="https://boraservico-backend.onrender.com"

Write-Host "========================================="
Write-Host "TESTE OPERACIONAL V34"
Write-Host "========================================="

Write-Host "[1] Health"
Invoke-RestMethod "$API/health"

Write-Host "[2] Services UTF-8"
Invoke-RestMethod "$API/services"

Write-Host "[3] Wallet"
Invoke-RestMethod "$API/wallet"

Write-Host "[4] Tracking"
Invoke-RestMethod "$API/tracking"

Write-Host "[5] IA operacional"
Invoke-RestMethod -Method Post -Uri "$API/ai-provider/price" -ContentType "application/json" -Body '{"category":"eletrica","urgent":true}'

Write-Host "[6] Audit fluxo app"
Invoke-RestMethod -Method Post -Uri "$API/security/audit" -ContentType "application/json" -Body '{"action":"OPERATIONAL_V34_TEST"}'

Write-Host "========================================="
Write-Host "TESTE OPERACIONAL V34 FINALIZADO"
Write-Host "========================================="
