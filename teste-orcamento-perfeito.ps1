$BaseUrl = "http://192.168.0.5:3000"

Write-Host "`n=== HEALTH ==="
Invoke-RestMethod "$BaseUrl/health"

Write-Host "`n=== LOGIN CLIENTE ==="
$cliente = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandescliente@gmail.com","password":"12345678"}'
$headersCliente = @{ Authorization = "Bearer $($cliente.access_token)" }
$cliente.user

Write-Host "`n=== LOGIN PROFISSIONAL ==="
$profissional = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandesprofissional@gmail.com","password":"12345678"}'
$headersProfissional = @{ Authorization = "Bearer $($profissional.access_token)" }
$profissional.user

Write-Host "`n=== LOGIN ADMIN ==="
$admin = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandesadmin@gmail.com","password":"12345678"}'
$headersAdmin = @{ Authorization = "Bearer $($admin.access_token)" }
$admin.user

Write-Host "`n=== CRIAR PEDIDO ORCAMENTO PERFEITO ==="
$rfqBody = @{
  title = "Troca de chuveiro com fiação aquecendo"
  description = "O chuveiro parou de funcionar e a fiação está esquentando. Preciso de avaliação segura."
  category = "Eletricista"
  address = "Rua Severino Soares, 299"
  urgency = "HIGH"
  preferredDate = "2026-05-27"
  preferredTime = "14:00"
} | ConvertTo-Json

$rfq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/quote-requests" -Headers $headersCliente -ContentType "application/json" -Body $rfqBody
$rfq
$rfqId = $rfq.id
if (-not $rfqId) { $rfqId = $rfq.requestForQuote.id }
Write-Host "RFQ ID: $rfqId"

Write-Host "`n=== IA HELPER / ESTRUTURAR PEDIDO ==="
try {
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/quote-requests/$rfqId/ai-helper" -Headers $headersCliente -ContentType "application/json" -Body '{}'
} catch {
  Write-Host "AI helper pode ter rota diferente. Erro:"
  $_.Exception.Message
}

Write-Host "`n=== BUSCAR ATE 5 PROFISSIONAIS ==="
try {
  $search = Invoke-RestMethod -Method Post -Uri "$BaseUrl/quote-requests/$rfqId/search" -Headers $headersCliente -ContentType "application/json" -Body '{}'
  $search
} catch {
  Write-Host "Erro na busca:"
  $_.Exception.Message
}

Write-Host "`n=== LISTAR NEGOCIACOES DO PEDIDO ==="
$negotiations = Invoke-RestMethod -Method Get -Uri "$BaseUrl/quote-requests/$rfqId/negotiations" -Headers $headersCliente
$negotiations

$negotiationId = $null
if ($negotiations -is [array]) {
  $negotiationId = $negotiations[0].id
} elseif ($negotiations.negotiations) {
  $negotiationId = $negotiations.negotiations[0].id
} elseif ($negotiations.data) {
  $negotiationId = $negotiations.data[0].id
}

Write-Host "NEGOTIATION ID: $negotiationId"

if (-not $negotiationId) {
  Write-Host "`nERRO: Nenhuma negociação encontrada. Verificar matching/rota."
  exit
}

Write-Host "`n=== PROFISSIONAL ENVIA ORCAMENTO INICIAL ==="
$quoteBody = @{
  amount = 180
  description = "Posso avaliar a fiação, trocar o chuveiro e revisar a instalação."
  estimatedDuration = "2 horas"
  includesMaterial = $false
  warranty = "30 dias"
} | ConvertTo-Json

$quote = Invoke-RestMethod -Method Post -Uri "$BaseUrl/quote-requests/$rfqId/negotiations/$negotiationId/quote" -Headers $headersProfissional -ContentType "application/json" -Body $quoteBody
$quote

Write-Host "`n=== CLIENTE ENVIA CONTRAPROPOSTA ==="
$counterBody = @{
  amount = 150
  message = "Consigo fechar por R$150 se for hoje?"
} | ConvertTo-Json

$counter = Invoke-RestMethod -Method Post -Uri "$BaseUrl/quote-requests/$rfqId/negotiations/$negotiationId/counter-offer" -Headers $headersCliente -ContentType "application/json" -Body $counterBody
$counter

Write-Host "`n=== PROFISSIONAL ENVIA VALOR FINAL ==="
$finalBody = @{
  amount = 165
  message = "Consigo fazer por R$165 com revisão da fiação."
} | ConvertTo-Json

$final = Invoke-RestMethod -Method Post -Uri "$BaseUrl/quote-requests/$rfqId/negotiations/$negotiationId/final-offer" -Headers $headersProfissional -ContentType "application/json" -Body $finalBody
$final

Write-Host "`n=== CLIENTE ACEITA PROPOSTA ==="
$accept = Invoke-RestMethod -Method Post -Uri "$BaseUrl/quote-requests/$rfqId/negotiations/$negotiationId/accept" -Headers $headersCliente -ContentType "application/json" -Body '{}'
$accept

Write-Host "`n=== ORDERS APOS ACEITE ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders" -Headers $headersCliente

Write-Host "`n=== WALLET ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/wallet/me" -Headers $headersCliente

Write-Host "`n=== TESTE ORCAMENTO PERFEITO FINALIZADO ==="