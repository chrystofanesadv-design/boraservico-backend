$BaseUrl = "http://192.168.0.5:3000"

Write-Host "`n=== HEALTH ==="
Invoke-RestMethod "$BaseUrl/health"

Write-Host "`n=== LOGIN CLIENTE ==="
$cliente = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandescliente@gmail.com","password":"12345678"}'
$cliente.user
$tokenCliente = $cliente.access_token
$headersCliente = @{ Authorization = "Bearer $tokenCliente" }

Write-Host "`n=== LOGIN PROFISSIONAL ==="
$profissional = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandesprofissional@gmail.com","password":"12345678"}'
$profissional.user

Write-Host "`n=== LOGIN ADMIN ==="
$admin = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body '{"email":"fernandesadmin@gmail.com","password":"12345678"}'
$admin.user

Write-Host "`n=== WALLET CLIENTE ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/wallet/me" -Headers $headersCliente

Write-Host "`n=== REFERRAL CLIENTE ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/referral/me" -Headers $headersCliente

Write-Host "`n=== ORDERS CLIENTE ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders" -Headers $headersCliente

Write-Host "`n=== CHAT LISTA ==="
Invoke-RestMethod -Method Get -Uri "$BaseUrl/chat" -Headers $headersCliente

Write-Host "`n=== TESTE FINALIZADO ==="