Write-Host "========================================="
Write-Host "TESTE FINAL BACKEND BORASERVICO"
Write-Host "========================================="

$base = "http://localhost:3000"

function Test-Get($name, $url) {
  try {
    Invoke-RestMethod "$base$url" | Out-Null
    Write-Host "[OK] $name"
  } catch {
    Write-Host "[ERRO] $name"
    Write-Host $_.Exception.Message
  }
}

function Test-Post($name, $url, $body) {
  try {
    Invoke-RestMethod -Method Post -Uri "$base$url" -ContentType "application/json" -Body $body | Out-Null
    Write-Host "[OK] $name"
  } catch {
    Write-Host "[ERRO] $name"
    Write-Host $_.Exception.Message
  }
}

Test-Get "Health" "/health"
Test-Get "Observability Health" "/observability/health"
Test-Get "Services" "/services"
Test-Get "Orders" "/orders"
Test-Get "Wallet" "/wallet"
Test-Get "Matching Professionals" "/matching/professionals"
Test-Get "Disputes" "/disputes"
Test-Get "Reputation" "/reputation"
Test-Get "Referral" "/referral"
Test-Get "Tracking" "/tracking"
Test-Get "Notifications" "/notifications"
Test-Get "Payments" "/payments"

Test-Post "AI Classify" "/ai/classify" '{"title":"Trocar tomada","description":"Serviço elétrico"}'
Test-Post "AI Price" "/ai/price" '{"category":"eletrica","urgent":true}'
Test-Post "AI Fraud Risk" "/ai/fraud-risk" '{"price":7000,"newAccount":true,"multipleCancels":true}'
Test-Post "Wallet Credit" "/wallet/credit" '{"amount":50}'
Test-Post "Notification Send" "/notifications/send" '{"userId":"cliente-final","title":"Teste final","message":"Backend OK","type":"SYSTEM"}'
Test-Post "Payment Escrow 10%" "/payments/escrow" '{"orderId":"ordem-final","clientId":"cliente-final","professionalId":"prof-final","amount":100}'

Write-Host "========================================="
Write-Host "TESTE FINAL CONCLUIDO"
Write-Host "========================================="