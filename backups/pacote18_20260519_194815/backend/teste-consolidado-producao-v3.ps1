$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE CONSOLIDADO BORASERVICO PRODUCAO V3"
Write-Host "========================================="

Invoke-RestMethod "$API/health"
Invoke-RestMethod "$API/observability/health"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod -Method Post -Uri "$API/upload/proof/mock" -ContentType "application/json" -Body '{"orderId":"ordem-v3","type":"CHECKOUT_PROOF","note":"Prova de finalizacao V3"}'
Invoke-RestMethod "$API/upload/proofs"

Invoke-RestMethod "$API/services"
Invoke-RestMethod "$API/orders"
Invoke-RestMethod "$API/wallet"
Invoke-RestMethod -Method Post -Uri "$API/wallet/credit" -ContentType "application/json" -Body '{"amount":50}'
Invoke-RestMethod "$API/matching/professionals"
Invoke-RestMethod "$API/disputes"
Invoke-RestMethod "$API/reputation"
Invoke-RestMethod "$API/referral"
Invoke-RestMethod "$API/tracking"
Invoke-RestMethod "$API/timeline"
Invoke-RestMethod "$API/chat"
Invoke-RestMethod "$API/notifications"

Invoke-RestMethod -Method Post -Uri "$API/notifications/send" -ContentType "application/json" -Body '{"userId":"cliente-app","title":"BoraServico V3","message":"Push real-ready funcionando.","type":"SYSTEM"}'

Invoke-RestMethod -Method Post -Uri "$API/ai/classify" -ContentType "application/json" -Body '{"title":"Instalar chuveiro","description":"Servico eletrico residencial"}'
Invoke-RestMethod -Method Post -Uri "$API/ai/price" -ContentType "application/json" -Body '{"category":"eletrica","urgent":true}'
Invoke-RestMethod -Method Post -Uri "$API/ai/fraud-risk" -ContentType "application/json" -Body '{"userId":"cliente-app","amount":250}'
Invoke-RestMethod -Method Post -Uri "$API/ai/conversion" -ContentType "application/json" -Body '{"service":"eletrica","price":250}'

Write-Host "========================================="
Write-Host "TESTE CONSOLIDADO V3 FINALIZADO"
Write-Host "========================================="
