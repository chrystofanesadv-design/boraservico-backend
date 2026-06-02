$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE PUSH REAL V9"
Write-Host "========================================="

Invoke-RestMethod "$API/push"

Invoke-RestMethod -Method Post -Uri "$API/push/token" -ContentType "application/json" -Body '{"userId":"cliente-app","token":"mock-fcm-token-v9"}'

Invoke-RestMethod "$API/push/tokens"

Invoke-RestMethod -Method Post -Uri "$API/push/send" -ContentType "application/json" -Body '{"userId":"cliente-app","title":"BoraServiÃ§o Push V9","body":"Push real-ready funcionando."}'

Invoke-RestMethod -Method Post -Uri "$API/push/send-token" -ContentType "application/json" -Body '{"token":"mock-fcm-token-v9","title":"BoraServiÃ§o","body":"Teste direto por token."}'

Write-Host "========================================="
Write-Host "TESTE PUSH REAL V9 FINALIZADO"
Write-Host "========================================="
