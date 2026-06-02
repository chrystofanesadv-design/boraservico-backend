# ============================================
# BoraServico - Script de Inicialização
# ============================================
# Salve como: iniciar-boraservico.ps1
# Execute: .\iniciar-boraservico.ps1
# ============================================

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     BoraServico - Inicialização Automática         ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar/Iniciar Docker
Write-Host "🐳 [1/6] Verificando Docker..." -ForegroundColor Yellow
try {
    $dockerStatus = docker ps --filter "name=boradb" --format "{{.Names}}"
    if ($dockerStatus -notcontains "boradb") {
        Write-Host "   ▶ Iniciando container boradb..." -ForegroundColor Cyan
        docker start boradb
        Start-Sleep -Seconds 3
    } else {
        Write-Host "   ✅ Container boradb já está rodando" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Docker não está acessível. Verifique se o Docker Desktop está aberto." -ForegroundColor Red
    Write-Host "   💡 Abra o Docker Desktop e execute este script novamente." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit
}

# 2. Parar processos antigos do NestJS
Write-Host "🛑 [2/6] Parando processos antigos..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*nest*" -or $_.MainWindowTitle -like "*boraservico*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ Processos antigos finalizados" -ForegroundColor Green

# 3. Limpar cache
Write-Host "🧹 [3/6] Limpando cache..." -ForegroundColor Yellow
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "node_modules\.cache") { Remove-Item -Recurse -Force "node_modules\.cache" }
Write-Host "   ✅ Cache limpo" -ForegroundColor Green

# 4. Verificar conexão com banco
Write-Host "🗄️  [4/6] Verificando banco de dados..." -ForegroundColor Yellow
try {
    $result = docker exec boradb psql -U postgres -d postgres -c "SELECT 1" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Banco boradb está acessível" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Banco acessível mas com warnings" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Não foi possível verificar o banco" -ForegroundColor Yellow
}

# 5. Compilar projeto
Write-Host "🔨 [5/6] Compilando projeto..." -ForegroundColor Yellow
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Erro na compilação!" -ForegroundColor Red
    Write-Host $buildResult -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit
}
Write-Host "   ✅ Projeto compilado com sucesso!" -ForegroundColor Green

# 6. Iniciar backend
Write-Host "🚀 [6/6] Iniciando backend..." -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   Backend iniciando em http://localhost:3000" -ForegroundColor Green
Write-Host "   Pressione Ctrl+C para parar" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Iniciar em modo desenvolvimento
npm run start:dev