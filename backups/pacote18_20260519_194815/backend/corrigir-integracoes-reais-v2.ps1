Write-Host "========================================="
Write-Host "BORASERVICO - CORRECAO INTEGRACOES V2"
Write-Host "========================================="

# 1. Corrigir main.ts completo
Write-Host "[1] Corrigindo main.ts..."

@'
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    app.enableCors({
      origin: '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type, Authorization',
    });

    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });

    const port = process.env.PORT || 3000;

    await app.listen(port);

    console.log(`🚀 API ONLINE NA PORTA ${port}`);
  } catch (error) {
    console.error('❌ ERRO AO INICIAR API:', error);
    process.exit(1);
  }
}

bootstrap();
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\main.ts"

# 2. Corrigir AndroidManifest sem quebrar replace
Write-Host "[2] Corrigindo AndroidManifest.xml..."

$manifest = "C:\Users\chrys\boraservico_app\android\app\src\main\AndroidManifest.xml"
$content = Get-Content $manifest -Raw

if ($content -notmatch 'android.permission.CAMERA') {
  $content = $content.Replace(
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />' + "`r`n    <uses-permission android:name=`"android.permission.CAMERA`" />"
  )
}

if ($content -notmatch 'android.permission.READ_MEDIA_IMAGES') {
  $content = $content.Replace(
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.CAMERA" />' + "`r`n    <uses-permission android:name=`"android.permission.READ_MEDIA_IMAGES`" />"
  )
}

Set-Content -Encoding UTF8 $manifest $content

# 3. Garantir pasta de uploads
Write-Host "[3] Garantindo pasta uploads/proofs..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\uploads\proofs" | Out-Null

# 4. Build backend
Write-Host "[4] Testando build backend..."
cd C:\Users\chrys\boraservico-backend
npm run build

# 5. Build Flutter
Write-Host "[5] Testando build Flutter..."
cd C:\Users\chrys\boraservico_app
flutter clean
flutter pub get
flutter build apk --debug

Write-Host "========================================="
Write-Host "CORRECAO INTEGRACOES V2 FINALIZADA"
Write-Host "========================================="