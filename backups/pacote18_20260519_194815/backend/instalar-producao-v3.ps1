Write-Host "========================================="
Write-Host "BORASERVICO - PRODUCAO V3"
Write-Host "Seed + Push + Payments + AI ready"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Criando script de teste consolidado..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE CONSOLIDADO BORASERVICO PRODUCAO V3"
Write-Host "========================================="

Invoke-RestMethod "$API/health"
Invoke-RestMethod "$API/observability/health"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod -Method Post -Uri "$API/upload/proof/mock" -ContentType "application/json" -Body '{"orderId":"ordem-v3","type":"CHECKOUT_PROOF","note":"Prova de finalizacao V3"}'
Invoke-RestMethod "$API/upload/proofs"

Invoke-RestMethod "$API/services"
Invoke-RestMethod "$API/orders"
Invoke-RestMethod "$API/wallet"
Invoke-RestMethod -Method Post -Uri "$API/wallet/credit" -ContentType "application/json" -Body '{"amount":50}'
Invoke-RestMethod "$API/matching/professionals"
Invoke-RestMethod "$API/disputes"
Invoke-RestMethod "$API/reputation"
Invoke-RestMethod "$API/referral"
Invoke-RestMethod "$API/tracking"
Invoke-RestMethod "$API/timeline"
Invoke-RestMethod "$API/chat"
Invoke-RestMethod "$API/notifications"

Invoke-RestMethod -Method Post -Uri "$API/notifications/send" -ContentType "application/json" -Body '{"userId":"cliente-app","title":"BoraServico V3","message":"Push real-ready funcionando.","type":"SYSTEM"}'

Invoke-RestMethod -Method Post -Uri "$API/ai/classify" -ContentType "application/json" -Body '{"title":"Instalar chuveiro","description":"Servico eletrico residencial"}'
Invoke-RestMethod -Method Post -Uri "$API/ai/price" -ContentType "application/json" -Body '{"category":"eletrica","urgent":true}'
Invoke-RestMethod -Method Post -Uri "$API/ai/fraud-risk" -ContentType "application/json" -Body '{"userId":"cliente-app","amount":250}'
Invoke-RestMethod -Method Post -Uri "$API/ai/conversion" -ContentType "application/json" -Body '{"service":"eletrica","price":250}'

Write-Host "========================================="
Write-Host "TESTE CONSOLIDADO V3 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-consolidado-producao-v3.ps1"

Write-Host "[2] Criando arquivo .env.production.example..."
@'
NODE_ENV=production
PORT=3000
JWT_SECRET=trocar_em_producao
DATABASE_URL=postgresql://usuario:senha@host:5432/boraservico

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

MERCADO_PAGO_ACCESS_TOKEN=
PAGARME_API_KEY=

GEMINI_API_KEY=
OPENAI_API_KEY=

UPLOAD_PUBLIC_URL=https://boraservico-backend.onrender.com/uploads
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\.env.production.example"

Write-Host "[3] Garantindo uploads..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\uploads\proofs" | Out-Null

Write-Host "[4] Testando build backend..."
npm run build

Write-Host "========================================="
Write-Host "PRODUCAO V3 INSTALADO COM SUCESSO"
Write-Host "========================================="