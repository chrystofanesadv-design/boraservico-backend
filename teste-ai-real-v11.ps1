$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE AI REAL V11"
Write-Host "========================================="

Invoke-RestMethod "$API/ai-real"

Invoke-RestMethod -Method Post -Uri "$API/ai-real/classify" -ContentType "application/json" -Body '{"title":"Trocar tomada","description":"Servico eletrico"}'

Invoke-RestMethod -Method Post -Uri "$API/ai-real/price" -ContentType "application/json" -Body '{"category":"eletrica","urgent":true}'

Invoke-RestMethod -Method Post -Uri "$API/ai-real/fraud-risk" -ContentType "application/json" -Body '{"userId":"cliente-app","amount":350}'

Invoke-RestMethod -Method Post -Uri "$API/ai-real/conversion" -ContentType "application/json" -Body '{"service":"eletrica","price":250}'

Invoke-RestMethod -Method Post -Uri "$API/ai-real/cancellation" -ContentType "application/json" -Body '{"service":"eletrica","price":250}'

Write-Host "========================================="
Write-Host "TESTE AI REAL V11 FINALIZADO"
Write-Host "========================================="
