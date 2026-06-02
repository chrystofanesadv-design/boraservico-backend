Write-Host "========================================="
Write-Host "BORASERVICO - SUPER PACOTE V7"
Write-Host "Realtime + Push + Tracking + Chat"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Instalando realtime/socket..."
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

Write-Host "[2] Criando gateway realtime..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\realtime" | Out-Null

@'
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('timeline')
  timeline(@MessageBody() body: any) {
    this.server.emit('timeline-update', {
      success: true,
      event: 'timeline-update',
      body,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      realtime: true,
    };
  }

  @SubscribeMessage('tracking')
  tracking(@MessageBody() body: any) {
    this.server.emit('tracking-update', {
      success: true,
      event: 'tracking-update',
      body,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      tracking: true,
    };
  }

  @SubscribeMessage('chat')
  chat(@MessageBody() body: any) {
    this.server.emit('chat-message', {
      success: true,
      event: 'chat-message',
      body,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      chat: true,
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\realtime\realtime.gateway.ts"

@'
import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\realtime\realtime.module.ts"

Write-Host "[3] Atualizando app.module.ts..."
$appModule = "C:\Users\chrys\boraservico-backend\src\app.module.ts"
$content = Get-Content $appModule -Raw

if ($content -notmatch "RealtimeModule") {
  $content = $content -replace "import \{ UploadModule \} from './upload/upload.module';", "import { UploadModule } from './upload/upload.module';`nimport { RealtimeModule } from './realtime/realtime.module';"

  $content = $content -replace "imports: \[", "imports: [`n    RealtimeModule,"
}

Set-Content -Encoding UTF8 $appModule $content

Write-Host "[4] Criando health realtime..."
@'
import { Controller, Get } from '@nestjs/common';

@Controller('realtime')
export class RealtimeHealthController {
  @Get()
  status() {
    return {
      success: true,
      module: 'realtime',
      websocket: true,
      timestamp: new Date().toISOString(),
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\realtime\realtime.health.ts"

Write-Host "[5] Criando teste consolidado realtime..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE REALTIME V7"
Write-Host "========================================="

Invoke-RestMethod "$API/realtime"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod "$API/tracking"
Invoke-RestMethod "$API/timeline"
Invoke-RestMethod "$API/chat"

Write-Host "========================================="
Write-Host "TESTE REALTIME V7 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-realtime-v7.ps1"

Write-Host "[6] Testando build backend..."
npm run build

Write-Host "========================================="
Write-Host "SUPER PACOTE V7 INSTALADO"
Write-Host "========================================="