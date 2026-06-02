$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SUPER PACOTE V22"
Write-Host "========================================="

Invoke-RestMethod "$API/health"

Invoke-RestMethod -Method Post `
-Uri "$API/fraud/analyze" `
-ContentType "application/json" `
-Body '{"amount":1200,"user":"cliente"}'

Invoke-RestMethod -Method Post `
-Uri "$API/payments-webhook" `
-Headers @{"x-signature"="secure-signature"} `
-ContentType "application/json" `
-Body '{"event":"payment_approved"}'

Invoke-RestMethod "$API/private-storage/test-file"

Invoke-RestMethod -Method Post "$API/sessions/refresh"

Invoke-RestMethod -Method Post "$API/sessions/revoke"

Write-Host "========================================="
Write-Host "TESTE V22 FINALIZADO"
Write-Host "========================================="
