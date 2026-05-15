$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SUPER PACOTE V27"
Write-Host "========================================="

Invoke-RestMethod "$API/health"

Invoke-RestMethod "$API/push-real"

Invoke-RestMethod -Method Post `
-Uri "$API/push-real/send" `
-ContentType "application/json" `
-Body '{"userId":"cliente-app","title":"Push realtime","body":"Teste V27"}'

Invoke-RestMethod "$API/realtime-final"

Invoke-RestMethod "$API/realtime"

Invoke-RestMethod "$API/push"

Write-Host "========================================="
Write-Host "TESTE V27 FINALIZADO"
Write-Host "========================================="
