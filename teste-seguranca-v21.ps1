$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SEGURANCA V21"
Write-Host "========================================="

Invoke-RestMethod "$API/health"
Invoke-RestMethod "$API/security"
Invoke-RestMethod -Method Post -Uri "$API/security/audit" -ContentType "application/json" -Body '{"action":"SECURITY_V21_TEST","module":"security","status":"ok"}'
Invoke-RestMethod "$API/security/audit"
Invoke-RestMethod "$API/security/admin/status"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod "$API/push"
Invoke-RestMethod "$API/payments-real/status"
Invoke-RestMethod "$API/ai-real"

Write-Host "========================================="
Write-Host "TESTE SEGURANCA V21 FINALIZADO"
Write-Host "========================================="
