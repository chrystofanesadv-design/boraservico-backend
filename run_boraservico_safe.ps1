Write-Host "🚀 BORASERVIÇO SAFE DEVOPS START" -ForegroundColor Green

# =========================
# 1. BACKEND
# =========================
Write-Host "🐳 Iniciando Docker DB..." -ForegroundColor Yellow
docker start boradb 2>$null

Write-Host "⚙️ Backend iniciar manual (NestJS)" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "cd C:\Users\chrys\boraservico-backend; npm run start:dev"

Start-Sleep -Seconds 5

# =========================
# 2. PRISMA SAFE FIX
# =========================
Write-Host "🧠 Prisma generate (safe mode)..." -ForegroundColor Yellow
cd C:\Users\chrys\boraservico-backend

taskkill /IM node.exe /F 2>$null

Start-Sleep -Seconds 2

npx prisma generate

# =========================
# 3. FLUTTER (CORRETO DIRETÓRIO)
# =========================
Write-Host "📱 Indo para Flutter..." -ForegroundColor Cyan
cd C:\Users\chrys\boraservico_app

if (!(Test-Path "pubspec.yaml")) {
    Write-Host "❌ ERRO: pubspec.yaml não encontrado!" -ForegroundColor Red
    exit
}

flutter clean
flutter pub get

# =========================
# 4. BUILD TESTE
# =========================
Write-Host "📦 APK build..." -ForegroundColor Cyan
flutter build apk --release

# =========================
# 5. BUILD PLAY STORE
# =========================
Write-Host "🏪 AAB build..." -ForegroundColor Cyan
flutter build appbundle --release

# =========================
# FINAL
# =========================
Write-Host "✅ SISTEMA OK" -ForegroundColor Green
Write-Host "Backend: http://localhost:3000" -ForegroundColor Green
Write-Host "Flutter build pronto" -ForegroundColor Green