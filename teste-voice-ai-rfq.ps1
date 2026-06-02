$BaseUrl = "http://192.168.0.5:3000"

Write-Host "`n=== HEALTH ==="
Invoke-RestMethod "$BaseUrl/health"

Write-Host "`n=== LOGIN CLIENTE ==="
$cliente = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandescliente@gmail.com","password":"12345678"}'
$headersCliente = @{ Authorization = "Bearer $($cliente.access_token)" }
$cliente.user

Write-Host "`n=== LOGIN PROFISSIONAL ==="
$prof = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandesprofissional@gmail.com","password":"12345678"}'
$headersProf = @{ Authorization = "Bearer $($prof.access_token)" }
$prof.user

Write-Host "`n=== VOICE GET ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/voice" -Headers $headersCliente

Write-Host "`n=== VOICE PARSE SERVICE ==="
$voiceServiceBody = @{
  text = "Preciso urgente de um eletricista porque o chuveiro queimou e a tomada está esquentando"
  locale = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/voice/parse-service" -Headers $headersCliente -ContentType "application/json" -Body $voiceServiceBody

Write-Host "`n=== VOICE PARSE QUOTE PROFISSIONAL ==="
$voiceQuoteBody = @{
  text = "Posso fazer por cento e oitenta reais amanhã cedo com garantia de trinta dias"
  locale = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/voice/parse-quote" -Headers $headersProf -ContentType "application/json" -Body $voiceQuoteBody

Write-Host "`n=== VOICE COMMAND ==="
$commandBody = @{
  text = "abrir negociações"
  role = "PROFESSIONAL"
  locale = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/voice/command" -Headers $headersProf -ContentType "application/json" -Body $commandBody

Write-Host "`n=== LANGUAGE PREFERENCES ==="
$langBody = @{
  appLanguage = "pt_BR"
  spokenLanguage = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/voice/language-preferences" -Headers $headersCliente -ContentType "application/json" -Body $langBody

Write-Host "`n=== CRIAR RFQ COM VOZ/FOTO METADATA ==="
$rfqBody = @{
  title = "Troca de chuveiro"
  description = "Chuveiro queimou e a fiação está esquentando"
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

Write-Host "`n=== RFQ MAX 3 / CONTACT LOCK ==="
Write-Host "maxProfessionals:" $rfq.matching.maxProfessionals
Write-Host "sentProfessionalCount:" $rfq.matching.sentProfessionalCount
Write-Host "contactUnlocked:" $rfq.request.contactUnlocked
Write-Host "protectedAddress:" $rfq.request.protectedAddress

Write-Host "`n=== NEGOCIAÇÕES RFQ ==="
$rfqDetails = Invoke-RestMethod -Method Get -Uri "$BaseUrl/request-for-quotes/$rfqId/negotiations" -Headers $headersCliente
$rfqDetails.negotiations | Select-Object id, professionalId, professionalName, status, contactUnlocked, protectedAddress

Write-Host "`n=== NEGOCIAÇÕES PROFISSIONAL ==="
$profNegotiations = Invoke-RestMethod -Method Get -Uri "$BaseUrl/negotiations/professional" -Headers $headersProf
$profNegotiations.negotiations | Select-Object id, requestId, professionalId, professionalName, status

Write-Host "`n=== BLOQUEIO CONTATO CHAT ==="
try {
  $chatBody = @{
    orderId = "seed-order-demo-real"
    message = "me chama no whatsapp (83) 98811-2233 instagram @teste ou wa.me/5583988112233"
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$BaseUrl/chat/message" -Headers $headersCliente -ContentType "application/json" -Body $chatBody
} catch {
  Write-Host "Bloqueio esperado OK:"
  $_.Exception.Message
}

Write-Host "`n=== ORDERS ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders" -Headers $headersCliente

Write-Host "`n=== REFERRAL ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/referral/me" -Headers $headersCliente

Write-Host "`n=== TESTE VOICE AI + RFQ FINALIZADO ==="