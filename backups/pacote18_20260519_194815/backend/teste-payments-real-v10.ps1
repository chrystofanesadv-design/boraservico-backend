$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE PAYMENTS REAL V10"
Write-Host "========================================="

Invoke-RestMethod "$API/payments-real/status"
Invoke-RestMethod -Method Post -Uri "$API/payments-real/checkout" -ContentType "application/json" -Body '{"provider":"mercado_pago","amount":250,"orderId":"ordem-payment-v10"}'
Invoke-RestMethod "$API/payments-real"
Invoke-RestMethod -Method Post -Uri "$API/payments-real/release" -ContentType "application/json" -Body '{"paymentId":"pay_demo"}'
Invoke-RestMethod -Method Post -Uri "$API/payments-real/refund" -ContentType "application/json" -Body '{"paymentId":"pay_demo"}'

Write-Host "========================================="
Write-Host "TESTE PAYMENTS REAL V10 FINALIZADO"
Write-Host "========================================="
