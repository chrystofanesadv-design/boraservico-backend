$BaseUrl = "http://192.168.0.5:3000"

Write-Host ""
Write-Host "==============================="
Write-Host "BoraServico Premium QA"
Write-Host "==============================="

function SafeGet {
    param(
        [string]$Name,
        [string]$Url,
        $Headers = $null
    )

    Write-Host ""
    Write-Host "=== $Name ==="

    try {
        if ($Headers) {
            Invoke-RestMethod -Method Get -Uri $Url -Headers $Headers
        } else {
            Invoke-RestMethod -Method Get -Uri $Url
        }
    } catch {
        Write-Host "ERRO:"
        Write-Host $_.Exception.Message
    }
}

function SafePost {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Body,
        $Headers = $null
    )

    Write-Host ""
    Write-Host "=== $Name ==="

    try {
        if ($Headers) {
            Invoke-RestMethod -Method Post `
                -Uri $Url `
                -Headers $Headers `
                -ContentType "application/json" `
                -Body $Body
        } else {
            Invoke-RestMethod -Method Post `
                -Uri $Url `
                -ContentType "application/json" `
                -Body $Body
        }
    } catch {
        Write-Host "ERRO:"
        Write-Host $_.Exception.Message
    }
}

SafeGet "HEALTH / OBSERVABILIDADE" "$BaseUrl/health"

Write-Host ""
Write-Host "=== LOGIN CLIENTE ==="

$cliente = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/auth/login" `
    -ContentType "application/json" `
    -Body '{"email":"fernandescliente@gmail.com","password":"12345678"}'

$headersCliente = @{
    Authorization = "Bearer $($cliente.access_token)"
}

$cliente.user

Write-Host ""
Write-Host "=== LOGIN PROFISSIONAL ==="

$prof = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/auth/login" `
    -ContentType "application/json" `
    -Body '{"email":"fernandesprofissional@gmail.com","password":"12345678"}'

$headersProf = @{
    Authorization = "Bearer $($prof.access_token)"
}

$prof.user

Write-Host ""
Write-Host "=== LOGIN ADMIN ==="

$admin = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/auth/login" `
    -ContentType "application/json" `
    -Body '{"email":"fernandesadmin@gmail.com","password":"12345678"}'

$headersAdmin = @{
    Authorization = "Bearer $($admin.access_token)"
}

$admin.user

SafeGet "WALLET" "$BaseUrl/wallet/me" $headersCliente

SafeGet "REFERRAL" "$BaseUrl/referral/me" $headersCliente

SafeGet "ORDERS" "$BaseUrl/orders" $headersCliente

SafeGet "CHAT" "$BaseUrl/chat" $headersCliente

SafeGet "VOICE STATUS" "$BaseUrl/voice" $headersCliente

SafeGet "MATCHING" "$BaseUrl/matching/professionals" $headersCliente

Write-Host ""
Write-Host "=== VOICE PARSE SERVICE ==="

$voiceService = @{
    text = "Preciso urgente de um eletricista porque o chuveiro queimou"
    locale = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/voice/parse-service" `
    -Headers $headersCliente `
    -ContentType "application/json" `
    -Body $voiceService

Write-Host ""
Write-Host "=== VOICE PARSE QUOTE ==="

$voiceQuote = @{
    text = "Posso fazer por cento e oitenta reais amanha cedo"
    locale = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/voice/parse-quote" `
    -Headers $headersProf `
    -ContentType "application/json" `
    -Body $voiceQuote

Write-Host ""
Write-Host "=== VOICE COMMANDS ==="

$voiceCmd = @{
    text = "abrir rota"
    role = "PROFESSIONAL"
    locale = "pt_BR"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/voice/command" `
    -Headers $headersProf `
    -ContentType "application/json" `
    -Body $voiceCmd

Write-Host ""
Write-Host "=== RFQ / ORCAMENTO PERFEITO ==="

$rfqBody = @{
    title = "Troca de chuveiro"
    description = "Chuveiro queimou e a fiacao esta esquentando"
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

$rfq = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/request-for-quotes" `
    -Headers $headersCliente `
    -ContentType "application/json" `
    -Body $rfqBody

$rfq

$rfqId = $rfq.request.id

Write-Host ""
Write-Host "=== RFQ CHECKS ==="

Write-Host "maxProfessionals:" $rfq.matching.maxProfessionals
Write-Host "sentProfessionalCount:" $rfq.matching.sentProfessionalCount
Write-Host "contactUnlocked:" $rfq.request.contactUnlocked
Write-Host "protectedAddress:" $rfq.request.protectedAddress

Write-Host ""
Write-Host "=== NEGOCIACOES RFQ ==="

$rfqDetails = Invoke-RestMethod `
    -Method Get `
    -Uri "$BaseUrl/request-for-quotes/$rfqId/negotiations" `
    -Headers $headersCliente

$rfqDetails.negotiations | Select-Object `
    id,
    professionalId,
    professionalName,
    status,
    contactUnlocked,
    protectedAddress

Write-Host ""
Write-Host "=== NEGOCIACOES PROFISSIONAL ==="

$profNegotiations = Invoke-RestMethod `
    -Method Get `
    -Uri "$BaseUrl/negotiations/professional" `
    -Headers $headersProf

$profNegotiations.negotiations | Select-Object `
    id,
    requestId,
    professionalId,
    professionalName,
    status

if (-not $profNegotiations.negotiations -or $profNegotiations.negotiations.Count -eq 0) {

    Write-Host ""
    Write-Host "ERRO: Nenhuma negociacao encontrada."
    exit
}

$negotiationId = $profNegotiations.negotiations[0].id

Write-Host ""
Write-Host "=== PROFISSIONAL ENVIA ORCAMENTO ==="

$quoteBody = @{
    amount = 180
    description = "Troca do chuveiro e revisao da fiacao"
    estimatedDuration = "2 horas"
    warranty = "30 dias"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/negotiations/$negotiationId/quote" `
    -Headers $headersProf `
    -ContentType "application/json" `
    -Body $quoteBody

Write-Host ""
Write-Host "=== CLIENTE CONTRAPROPOSTA ==="

$counterBody = @{
    amount = 160
    message = "Fechamos por R$160?"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/negotiations/$negotiationId/counter-offer" `
    -Headers $headersCliente `
    -ContentType "application/json" `
    -Body $counterBody

Write-Host ""
Write-Host "=== PROFISSIONAL VALOR FINAL ==="

$finalBody = @{
    amount = 170
    message = "Valor final R$170 com garantia."
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/negotiations/$negotiationId/final-offer" `
    -Headers $headersProf `
    -ContentType "application/json" `
    -Body $finalBody

Write-Host ""
Write-Host "=== CLIENTE ACEITA / ESCROW ==="

$accept = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/negotiations/$negotiationId/accept" `
    -Headers $headersCliente `
    -ContentType "application/json" `
    -Body '{}'

$accept

$orderId = $accept.orderId

Write-Host ""
Write-Host "=== ORDERS APOS ACEITE ==="

$orders = Invoke-RestMethod `
    -Method Get `
    -Uri "$BaseUrl/orders" `
    -Headers $headersCliente

$orders | Select-Object `
    id,
    orderId,
    title,
    status,
    professionalId,
    contactUnlocked,
    protectedUntilPayment

Write-Host ""
Write-Host "=== TESTE ANTIFRAUDE ==="

try {

    $chatBody = @{
        orderId = $orderId
        message = "me chama no whatsapp (83) 98811-2233 instagram @teste wa.me/5583988112233"
    } | ConvertTo-Json

    Invoke-RestMethod `
        -Method Post `
        -Uri "$BaseUrl/chat/message" `
        -Headers $headersCliente `
        -ContentType "application/json" `
        -Body $chatBody

} catch {

    Write-Host "Bloqueio OK:"
    Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "=== ADMIN NEGOCIACOES ==="

SafeGet `
    "ADMIN NEGOTIATIONS" `
    "$BaseUrl/negotiations/admin" `
    $headersAdmin

Write-Host ""
Write-Host "==============================="
Write-Host "TESTE PREMIUM FINALIZADO"
Write-Host "==============================="