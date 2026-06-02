Write-Host "========================================="
Write-Host "BORASERVICO - INTEGRACOES REAIS V2"
Write-Host "Storage publico + Upload static + Android permissions"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Garantindo pasta uploads..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\uploads\proofs" | Out-Null

Write-Host "[2] Atualizando main.ts para servir arquivos estaticos..."
$main = "C:\Users\chrys\boraservico-backend\src\main.ts"
$content = Get-Content $main -Raw

if ($content -notmatch "useStaticAssets") {
  $content = $content -replace "import \{ NestFactory \} from '@nestjs/core';", "import { NestFactory } from '@nestjs/core';`nimport { NestExpressApplication } from '@nestjs/platform-express';`nimport { join } from 'path';"

  $content = $content -replace "const app = await NestFactory.create\(AppModule\);", "const app = await NestFactory.create<NestExpressApplication>(AppModule);"

  $content = $content -replace "await app.listen", "app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });`n`n    await app.listen"
}

Set-Content -Encoding UTF8 $main $content

Write-Host "[3] Atualizando AndroidManifest com camera/storage..."
$manifest = "C:\Users\chrys\boraservico_app\android\app\src\main\AndroidManifest.xml"
$manifestContent = Get-Content $manifest -Raw

if ($manifestContent -notmatch "android.permission.CAMERA") {
  $manifestContent = $manifestContent -replace '<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />' + "`n    <uses-permission android:name=`"android.permission.CAMERA`" />"
}

if ($manifestContent -notmatch "READ_MEDIA_IMAGES") {
  $manifestContent = $manifestContent -replace '<uses-permission android:name="android.permission.CAMERA" />', '<uses-permission android:name="android.permission.CAMERA" />' + "`n    <uses-permission android:name=`"android.permission.READ_MEDIA_IMAGES`" />"
}

Set-Content -Encoding UTF8 $manifest $manifestContent

Write-Host "[4] Testando backend build..."
cd C:\Users\chrys\boraservico-backend
npm run build

Write-Host "[5] Testando Flutter build..."
cd C:\Users\chrys\boraservico_app
flutter clean
flutter pub get
flutter build apk --debug

Write-Host "========================================="
Write-Host "INTEGRACOES REAIS V2 INSTALADAS"
Write-Host "========================================="