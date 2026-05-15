$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SUPER PACOTE V24"
Write-Host "========================================="

Write-Host "[1] Health"
Invoke-RestMethod "$API/health"

Write-Host "[2] Admin pÃºblico"
Invoke-RestMethod "$API/admin"

Write-Host "[3] Admin action pÃºblica/log"
Invoke-RestMethod -Method Post -Uri "$API/admin/action" -ContentType "application/json" -Body '{"action":"V24_PUBLIC_ADMIN_LOG"}'

Write-Host "[4] Security"
Invoke-RestMethod "$API/security"

Write-Host "[5] Audit"
Invoke-RestMethod -Method Post -Uri "$API/security/audit" -ContentType "application/json" -Body '{"action":"V24_SECURITY_AUDIT"}'
Invoke-RestMethod "$API/security/audit"

Write-Host "[6] Protegido sem token deve falhar 401/403"
try {
  Invoke-RestMethod "$API/admin/protected-status"
} catch {
  Write-Host "[OK] Rota protegida bloqueou sem token."
}

Write-Host "========================================="
Write-Host "TESTE V24 FINALIZADO"
Write-Host "========================================="
