$BaseUrl = "http://192.168.0.5:3000"

Write-Host ""
Write-Host "=== HEALTH ==="
Invoke-RestMethod "$BaseUrl/health"

Write-Host ""
Write-Host "=== LOGIN CLIENTE ==="
$cliente = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandescliente@gmail.com","password":"12345678"}'
$headersCliente = @{ Authorization = "Bearer $($cliente.access_token)" }
$cliente.user

Write-Host ""
Write-Host "=== LOGIN PROFISSIONAL ==="
$prof = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandesprofissional@gmail.com","password":"12345678"}'
$headersProf = @{ Authorization = "Bearer $($prof.access_token)" }
$prof.user

Write-Host ""
Write-Host "=== VOICE STATUS ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/voice" -Headers $headersCliente

Write-Host ""
Write-Host "=== VOICE COMMAND TRACKING ==="
$cmd = @{
  text = "abrir rota"
  role = "PROFESSIONAL"
  locale = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/voice/command" -Headers $headersProf -ContentType "application/json" -Body $cmd

Write-Host ""
Write-Host "=== MATCHING PROFESSIONALS ==="
try {
  Invoke-RestMethod -Method Get -Uri "$BaseUrl/matching/professionals" -Headers $headersCliente
} catch {
  Write-Host "matching/professionals erro ou rota diferente:"
  Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "=== CRIAR RFQ NOVO ==="
$rfqBody = @{
  title = "Troca de chuveiro"
  description = "Chuveiro queimou e a fiacao esta esquentando"
  category = "Eletricista"
  address = "Rua Severino Soares"
  urgency = "HIGH"
  voiceTranscript = "Preciso urgente de um eletricista porque o chuveiro queimou"
  media = @{
    hasVoice = $true
    hasPhoto = $true
    photoCount = 1
  }
} | ConvertTo-Json -Depth 6

$rfq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/request-for-quotes" -Headers $headersCliente -ContentType "application/json" -Body $rfqBody
$rfq
$rfqId = $rfq.request.id

Write-Host ""
Write-Host "=== RFQ CHECKS ==="
Write-Host "maxProfessionals:" $rfq.matching.maxProfessionals
Write-Host "sentProfessionalCount:" $rfq.matching.sentProfessionalCount
Write-Host "contactUnlocked:" $rfq.request.contactUnlocked
Write-Host "protectedAddress:" $rfq.request.protectedAddress

Write-Host ""
Write-Host "=== NEGOCIACOES RFQ ==="
$rfqDetails = Invoke-RestMethod -Method Get -Uri "$BaseUrl/request-for-quotes/$rfqId/negotiations" -Headers $headersCliente
$rfqDetails.negotiations | Select-Object id, professionalId, professionalName, status, contactUnlocked, protectedAddress

Write-Host ""
Write-Host "=== NEGOCIACOES PROFISSIONAL REAL ==="
$profNegotiations = Invoke-RestMethod -Method Get -Uri "$BaseUrl/negotiations/professional" -Headers $headersProf
$profNegotiations.negotiations | Select-Object id, requestId, professionalId, professionalName, status

if (-not $profNegotiations.negotiations -or $profNegotiations.negotiations.Count -eq 0) {
  Write-Host ""
  Write-Host "ERRO: Nenhuma negociacao encontrada para o profissional real."
  exit
}

$negotiationId = $profNegotiations.negotiations[0].id

Write-Host ""
Write-Host "=== PROFISSIONAL ENVIA ORCAMENTO ==="
$quoteBody = @{
  amount = 180
  description = "Troca do chuveiro e revisao da fiacao"
  estimatedDuration = "2 horas"
  warranty = "30 dias"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/negotiations/$negotiationId/quote" -Headers $headersProf -ContentType "application/json" -Body $quoteBody

Write-Host ""
Write-Host "=== CLIENTE CONTRAPROPOSTA ==="
$counterBody = @{
  amount = 160
  message = "Fechamos por R$160?"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/negotiations/$negotiationId/counter-offer" -Headers $headersCliente -ContentType "application/json" -Body $counterBody

Write-Host ""
Write-Host "=== PROFISSIONAL VALOR FINAL ==="
$finalBody = @{
  amount = 170
  message = "Valor final R$170 com garantia."
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/negotiations/$negotiationId/final-offer" -Headers $headersProf -ContentType "application/json" -Body $finalBody

Write-Host ""
Write-Host "=== CLIENTE ACEITA ==="
$accept = Invoke-RestMethod -Method Post -Uri "$BaseUrl/negotiations/$negotiationId/accept" -Headers $headersCliente -ContentType "application/json" -Body '{}'
$accept

Write-Host ""
Write-Host "=== ORDERS APOS ACEITE ==="
$orders = Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders" -Headers $headersCliente
$orders | Select-Object id, orderId, title, status, professionalId, contactUnlocked, protectedUntilPayment

Write-Host ""
Write-Host "=== BLOQUEIO CONTATO CHAT ==="
try {
  $chatBody = @{
    orderId = "seed-order-demo-real"
    message = "me chama no whatsapp (83) 98811-2233 instagram @teste ou wa.me/5583988112233"
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$BaseUrl/chat/message" -Headers $headersCliente -ContentType "application/json" -Body $chatBody
} catch {
  Write-Host "Bloqueio esperado OK:"
  Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "=== REFERRAL ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/referral/me" -Headers $headersCliente

Write-Host ""
Write-Host "=== TESTE FINALIZADO ==="
