Write-Host "========================================="
Write-Host "TESTE FULLSTACK BORASERVICO PLAY STORE"
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

function Test-Post($name, $url, $body = "{}") {
  try {
    Invoke-RestMethod -Method Post -Uri "$base$url" -ContentType "application/json" -Body $body | Out-Null
    Write-Host "[OK] $name"
  } catch {
    Write-Host "[ERRO] $name"
    Write-Host $_.Exception.Message
  }
}

Test-Get "Health" "/health"
Test-Get "Observability" "/observability/health"
Test-Get "Services" "/services"
Test-Get "Orders" "/orders"
Test-Get "Wallet" "/wallet"
Test-Get "Payments" "/payments"
Test-Get "Matching" "/matching/professionals"
Test-Get "Disputes" "/disputes"
Test-Get "Reputation" "/reputation"
Test-Get "Referral" "/referral"
Test-Get "Tracking" "/tracking"
Test-Get "Timeline" "/timeline"
Test-Get "Chat" "/chat"
Test-Get "Notifications" "/notifications"

Test-Post "Login" "/auth/login" '{"email":"cliente@teste.com","password":"123456"}'
Test-Post "AI Classify" "/ai/classify" '{"title":"Trocar tomada","description":"Servico eletrico"}'
Test-Post "AI Price" "/ai/price" '{"category":"eletrica","urgent":true}'
Test-Post "Payment Escrow 10%" "/payments/escrow" '{"orderId":"ordem-playstore","clientId":"cliente-playstore","professionalId":"prof-playstore","amount":100}'
Test-Post "Timeline Demo" "/timeline/demo/ordem-playstore"
Test-Post "Chat Demo" "/chat/demo/ordem-playstore"
Test-Post "Notification" "/notifications/send" '{"userId":"cliente-playstore","title":"Teste Play Store","message":"Fullstack OK","type":"SYSTEM"}'

Write-Host "========================================="
Write-Host "TESTE FULLSTACK FINALIZADO"
Write-Host "========================================="