Write-Host "========================================="
Write-Host "BORASERVICO - PUSH REAL V9"
Write-Host "Firebase Admin + FCM Token + Push Ready"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Instalando Firebase Admin..."
npm install firebase-admin

Write-Host "[2] Criando push module..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\push" | Out-Null

@'
import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\push\push.module.ts"

@'
import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class PushService {
  private initialized = false;
  private tokens = new Map<string, string>();

  private initFirebase() {
    if (this.initialized) return;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.initialized = false;
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    this.initialized = true;
  }

  saveToken(userId: string, token: string) {
    this.tokens.set(userId, token);

    return {
      success: true,
      userId,
      tokenSaved: true,
      savedAt: new Date().toISOString(),
    };
  }

  listTokens() {
    return Array.from(this.tokens.entries()).map(([userId, token]) => ({
      userId,
      token,
    }));
  }

  async sendToUser(userId: string, title: string, body: string, data?: any) {
    const token = this.tokens.get(userId);

    if (!token) {
      return {
        success: false,
        reason: 'FCM token not found for user',
        userId,
      };
    }

    return this.sendToToken(token, title, body, data);
  }

  async sendToToken(token: string, title: string, body: string, data?: any) {
    this.initFirebase();

    if (!this.initialized) {
      return {
        success: true,
        mode: 'mock',
        message: 'Firebase Admin env vars not configured yet',
        tokenPreview: token.substring(0, 20),
        title,
        body,
        data: data ?? {},
        sentAt: new Date().toISOString(),
      };
    }

    const response = await admin.messaging().send({
      token,
      notification: {
        title,
        body,
      },
      data: data ?? {},
    });

    return {
      success: true,
      mode: 'firebase',
      response,
      sentAt: new Date().toISOString(),
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\push\push.service.ts"

@'
import { Body, Controller, Get, Post } from '@nestjs/common';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'push',
      firebaseAdminReady: Boolean(
        process.env.FIREBASE_PROJECT_ID &&
          process.env.FIREBASE_CLIENT_EMAIL &&
          process.env.FIREBASE_PRIVATE_KEY,
      ),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tokens')
  tokens() {
    return this.pushService.listTokens();
  }

  @Post('token')
  saveToken(@Body() body: any) {
    return this.pushService.saveToken(
      body.userId ?? 'cliente-app',
      body.token ?? 'mock-token',
    );
  }

  @Post('send')
  async send(@Body() body: any) {
    return this.pushService.sendToUser(
      body.userId ?? 'cliente-app',
      body.title ?? 'BoraServiço',
      body.body ?? body.message ?? 'Notificação BoraServiço',
      body.data ?? {},
    );
  }

  @Post('send-token')
  async sendToken(@Body() body: any) {
    return this.pushService.sendToToken(
      body.token ?? 'mock-token',
      body.title ?? 'BoraServiço',
      body.body ?? body.message ?? 'Notificação BoraServiço',
      body.data ?? {},
    );
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\push\push.controller.ts"

Write-Host "[3] Atualizando app.module.ts..."
$appModule = "C:\Users\chrys\boraservico-backend\src\app.module.ts"
$content = Get-Content $appModule -Raw

if ($content -notmatch "PushModule") {
  $content = $content -replace "import \{ RealtimeModule \} from './realtime/realtime.module';", "import { RealtimeModule } from './realtime/realtime.module';`nimport { PushModule } from './push/push.module';"
  $content = $content -replace "imports: \[", "imports: [`n    PushModule,"
}

Set-Content -Encoding UTF8 $appModule $content

Write-Host "[4] Criando teste push v9..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE PUSH REAL V9"
Write-Host "========================================="

Invoke-RestMethod "$API/push"

Invoke-RestMethod -Method Post -Uri "$API/push/token" -ContentType "application/json" -Body '{"userId":"cliente-app","token":"mock-fcm-token-v9"}'

Invoke-RestMethod "$API/push/tokens"

Invoke-RestMethod -Method Post -Uri "$API/push/send" -ContentType "application/json" -Body '{"userId":"cliente-app","title":"BoraServiço Push V9","body":"Push real-ready funcionando."}'

Invoke-RestMethod -Method Post -Uri "$API/push/send-token" -ContentType "application/json" -Body '{"token":"mock-fcm-token-v9","title":"BoraServiço","body":"Teste direto por token."}'

Write-Host "========================================="
Write-Host "TESTE PUSH REAL V9 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-push-real-v9.ps1"

Write-Host "[5] Testando build backend..."
npm run build

Write-Host "========================================="
Write-Host "PUSH REAL V9 INSTALADO"
Write-Host "========================================="