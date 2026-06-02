$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SUPER PACOTE V30"
Write-Host "========================================="

Invoke-RestMethod "$API/health"

Invoke-RestMethod -Method Post `
-Uri "$API/ai-provider/classify" `
-ContentType "application/json" `
-Body '{"title":"Trocar tomada","description":"Servico residencial"}'

Invoke-RestMethod -Method Post `
-Uri "$API/ai-provider/price" `
-ContentType "application/json" `
-Body '{"category":"eletrica","urgent":true}'

Invoke-RestMethod -Method Post `
-Uri "$API/payments-provider/checkout" `
-ContentType "application/json" `
-Body '{"amount":350,"service":"Servico eletrico"}'

Write-Host "========================================="
Write-Host "TESTE V30 FINALIZADO"
Write-Host "========================================="
