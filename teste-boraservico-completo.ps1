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

Write-Host "`n=== WALLET ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/wallet/me" -Headers $headersCliente

Write-Host "`n=== REFERRAL ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/referral/me" -Headers $headersCliente

Write-Host "`n=== CRIAR RFQ ==="
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

Write-Host "`n=== NEGOCIAÇÕES DO RFQ ==="
$r = Invoke-RestMethod -Method Get -Uri "$BaseUrl/request-for-quotes/$rfqId/negotiations" -Headers $headersCliente
$r.negotiations

Write-Host "`n=== NEGOCIAÇÕES PROFISSIONAL ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/negotiations/professional" -Headers $headersProf

Write-Host "`n=== ORDERS ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders" -Headers $headersCliente

Write-Host "`n=== CHAT ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/chat" -Headers $headersCliente

Write-Host "`n=== TESTE FINALIZADO ==="