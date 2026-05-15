$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE FINAL BORASERVICO IMPLEMENTACOES"
Write-Host "========================================="

Write-Host "[1] Health"
Invoke-RestMethod "$API/health"

Write-Host "[2] Observability"
Invoke-RestMethod "$API/observability/health"

Write-Host "[3] Upload"
Invoke-RestMethod "$API/upload"

Write-Host "[4] Upload Proof Mock"
Invoke-RestMethod -Method Post -Uri "$API/upload/proof/mock" -ContentType "application/json" -Body '{"orderId":"ordem-final","type":"CHECKOUT_PROOF","note":"Prova final consolidada"}'

Write-Host "[5] Upload Proofs"
Invoke-RestMethod "$API/upload/proofs"

Write-Host "[6] Push"
Invoke-RestMethod "$API/push"

Write-Host "[7] Push token"
Invoke-RestMethod -Method Post -Uri "$API/push/token" -ContentType "application/json" -Body '{"userId":"cliente-app","token":"mock-final-token"}'

Write-Host "[8] Push send"
Invoke-RestMethod -Method Post -Uri "$API/push/send" -ContentType "application/json" -Body '{"userId":"cliente-app","title":"BoraServico Final","body":"Push final consolidado"}'

Write-Host "[9] Payments Real Status"
Invoke-RestMethod "$API/payments-real/status"

Write-Host "[10] Payments Real Checkout"
Invoke-RestMethod -Method Post -Uri "$API/payments-real/checkout" -ContentType "application/json" -Body '{"provider":"mercado_pago","amount":300,"orderId":"ordem-final-payment"}'

Write-Host "[11] Payments Real List"
Invoke-RestMethod "$API/payments-real"

Write-Host "[12] AI Real Status"
Invoke-RestMethod "$API/ai-real"

Write-Host "[13] AI Real Classify"
Invoke-RestMethod -Method Post -Uri "$API/ai-real/classify" -ContentType "application/json" -Body '{"title":"Instalar chuveiro","description":"Servico eletrico residencial"}'

Write-Host "[14] AI Real Price"
Invoke-RestMethod -Method Post -Uri "$API/ai-real/price" -ContentType "application/json" -Body '{"category":"eletrica","urgent":true}'

Write-Host "[15] AI Real Fraud"
Invoke-RestMethod -Method Post -Uri "$API/ai-real/fraud-risk" -ContentType "application/json" -Body '{"userId":"cliente-app","amount":300}'

Write-Host "[16] AI Real Conversion"
Invoke-RestMethod -Method Post -Uri "$API/ai-real/conversion" -ContentType "application/json" -Body '{"service":"eletrica","price":300}'

Write-Host "[17] Realtime"
Invoke-RestMethod "$API/realtime"

Write-Host "[18] Services"
Invoke-RestMethod "$API/services"

Write-Host "[19] Orders"
Invoke-RestMethod "$API/orders"

Write-Host "[20] Wallet"
Invoke-RestMethod "$API/wallet"

Write-Host "[21] Matching"
Invoke-RestMethod "$API/matching/professionals"

Write-Host "[22] Disputes"
Invoke-RestMethod "$API/disputes"

Write-Host "[23] Reputation"
Invoke-RestMethod "$API/reputation"

Write-Host "[24] Referral"
Invoke-RestMethod "$API/referral"

Write-Host "[25] Tracking"
Invoke-RestMethod "$API/tracking"

Write-Host "[26] Timeline"
Invoke-RestMethod "$API/timeline"

Write-Host "[27] Chat"
Invoke-RestMethod "$API/chat"

Write-Host "[28] Notifications"
Invoke-RestMethod "$API/notifications"

Write-Host "========================================="
Write-Host "TESTE FINAL IMPLEMENTACOES CONCLUIDO"
Write-Host "========================================="
