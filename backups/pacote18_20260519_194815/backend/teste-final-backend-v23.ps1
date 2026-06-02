$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE FINAL BACKEND V23"
Write-Host "========================================="

Write-Host "[1] Core"
Invoke-RestMethod "$API/health"
Invoke-RestMethod "$API/observability/health"

Write-Host "[2] Security/Admin"
Invoke-RestMethod "$API/security"
Invoke-RestMethod -Method Post -Uri "$API/security/audit" -ContentType "application/json" -Body '{"action":"V23_TEST","status":"ok"}'
Invoke-RestMethod "$API/security/audit"
Invoke-RestMethod "$API/admin"
Invoke-RestMethod -Method Post -Uri "$API/admin/action" -ContentType "application/json" -Body '{"action":"CHECK_ADMIN_V23"}'
Invoke-RestMethod "$API/admin/actions"

Write-Host "[3] Sessions"
Invoke-RestMethod -Method Post -Uri "$API/sessions/refresh"
Invoke-RestMethod -Method Post -Uri "$API/sessions/revoke"

Write-Host "[4] Storage/Upload"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod -Method Post -Uri "$API/upload/proof/mock" -ContentType "application/json" -Body '{"orderId":"ordem-v23","type":"CHECKOUT_PROOF","note":"Teste final V23"}'
Invoke-RestMethod "$API/upload/proofs"
Invoke-RestMethod "$API/private-storage/teste-v23.jpg"

Write-Host "[5] Webhook/Pagamentos"
Invoke-RestMethod "$API/payments-real/status"
Invoke-RestMethod -Method Post -Uri "$API/payments-real/checkout" -ContentType "application/json" -Body '{"provider":"mercado_pago","amount":350,"orderId":"ordem-v23"}'
Invoke-RestMethod -Method Post -Uri "$API/payments-webhook" -Headers @{"x-signature"="assinatura-v23"} -ContentType "application/json" -Body '{"event":"payment_approved","orderId":"ordem-v23"}'

Write-Host "[6] Fraud/AI"
Invoke-RestMethod -Method Post -Uri "$API/fraud/analyze" -ContentType "application/json" -Body '{"amount":350,"userId":"cliente-app","orderId":"ordem-v23"}'
Invoke-RestMethod "$API/ai-real"
Invoke-RestMethod -Method Post -Uri "$API/ai-real/price" -ContentType "application/json" -Body '{"category":"eletrica","urgent":true}'

Write-Host "[7] Push/Realtime"
Invoke-RestMethod "$API/push"
Invoke-RestMethod -Method Post -Uri "$API/push/token" -ContentType "application/json" -Body '{"userId":"cliente-app","token":"mock-token-v23"}'
Invoke-RestMethod -Method Post -Uri "$API/push/send" -ContentType "application/json" -Body '{"userId":"cliente-app","title":"V23","body":"Push test"}'
Invoke-RestMethod "$API/realtime"

Write-Host "[8] Marketplace"
Invoke-RestMethod "$API/services"
Invoke-RestMethod "$API/orders"
Invoke-RestMethod "$API/wallet"
Invoke-RestMethod "$API/matching/professionals"
Invoke-RestMethod "$API/disputes"
Invoke-RestMethod "$API/reputation"
Invoke-RestMethod "$API/referral"
Invoke-RestMethod "$API/tracking"
Invoke-RestMethod "$API/timeline"
Invoke-RestMethod "$API/chat"
Invoke-RestMethod "$API/notifications"

Write-Host "========================================="
Write-Host "TESTE FINAL BACKEND V23 CONCLUIDO"
Write-Host "========================================="
