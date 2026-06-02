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

Write-Host "`n=== CRIAR RFQ NOVO ==="
$rfqBody = @{
  title = "Troca de chuveiro"
  description = "Chuveiro queimou e a fiação está esquentando"
  category = "Eletricista"
  address = "Rua Severino Soares"
  urgency = "HIGH"
} | ConvertTo-Json

$rfq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/request-for-quotes" -Headers $headersCliente -ContentType "application/json" -Body $rfqBody
$rfq
$rfqId = $rfq.request.id

Write-Host "`n=== VERIFICAR RFQ MAX 3 ==="
Write-Host "maxProfessionals:" $rfq.matching.maxProfessionals
Write-Host "sentProfessionalCount:" $rfq.matching.sentProfessionalCount

Write-Host "`n=== NEGOCIAÇÕES DO RFQ ==="
$rfqDetails = Invoke-RestMethod -Method Get -Uri "$BaseUrl/request-for-quotes/$rfqId/negotiations" -Headers $headersCliente
$rfqDetails.negotiations | Select-Object id, professionalId, professionalName, status, contactUnlocked, protectedAddress

Write-Host "`n=== TOTAL NEGOCIAÇÕES ==="
$rfqDetails.negotiations.Count

Write-Host "`n=== VERIFICAR CONTACT LOCK ==="
$rfqDetails.negotiations | Select-Object professionalName, contactUnlocked, protectedAddress, contactSafety

Write-Host "`n=== NEGOCIAÇÕES DO PROFISSIONAL REAL ==="
$profNegotiations = Invoke-RestMethod -Method Get -Uri "$BaseUrl/negotiations/professional" -Headers $headersProf
$profNegotiations
$profNegotiations.negotiations | Select-Object id, requestId, professionalId, professionalName, status

Write-Host "`n=== TESTE BLOQUEIO CONTATO NO CHAT ==="
try {
  $chatBody = @{
    orderId = "seed-order-demo-real"
    message = "me chama no whatsapp 83988112233 ou instagram @teste"
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$BaseUrl/chat/message" -Headers $headersCliente -ContentType "application/json" -Body $chatBody
} catch {
  Write-Host "Bloqueio/erro esperado:"
  $_.Exception.Message
}

Write-Host "`n=== ORDERS SEM DEV VISÍVEL ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders" -Headers $headersCliente

Write-Host "`n=== REFERRAL ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/referral/me" -Headers $headersCliente

Write-Host "`n=== TESTE FINALIZADO ==="