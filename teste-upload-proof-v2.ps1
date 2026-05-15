$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE UPLOAD PROOF V2"
Write-Host "========================================="

Write-Host "[1] Upload module"
Invoke-RestMethod "$API/upload"

Write-Host "[2] Criar proof mock"
Invoke-RestMethod -Method Post -Uri "$API/upload/proof/mock" -ContentType "application/json" -Body '{"orderId":"ordem-upload-demo","type":"CHECKOUT_PROOF","note":"Foto de conclusao do servico"}'

Write-Host "[3] Listar proofs"
Invoke-RestMethod "$API/upload/proofs"

Write-Host "========================================="
Write-Host "TESTE UPLOAD PROOF V2 FINALIZADO"
Write-Host "========================================="
