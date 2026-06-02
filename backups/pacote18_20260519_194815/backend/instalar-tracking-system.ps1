Write-Host "========================================="
Write-Host "INSTALANDO TRACKING + GPS SYSTEM"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$tracking = "$backend\src\tracking"

New-Item -ItemType Directory -Force -Path $tracking | Out-Null

@'
import { Injectable } from '@nestjs/common';

interface LocationPoint {
  latitude: number;
  longitude: number;
  createdAt: Date;
}

interface TrackingSession {
  orderId: string;
  professionalId: string;
  status: 'WAITING' | 'CHECKED_IN' | 'IN_PROGRESS' | 'CHECKED_OUT';
  checkInAt?: Date;
  checkOutAt?: Date;
  lastLocation?: LocationPoint;
  history: LocationPoint[];
  proofPhotoUrl?: string;
  note?: string;
  updatedAt: Date;
}

@Injectable()
export class TrackingService {
  private sessions: TrackingSession[] = [];

  checkIn(data: any) {
    const orderId = data?.orderId;
    const professionalId = data?.professionalId;

    let session = this.sessions.find((item) => item.orderId === orderId);

    if (!session) {
      session = {
        orderId,
        professionalId,
        status: 'CHECKED_IN',
        checkInAt: new Date(),
        history: [],
        updatedAt: new Date(),
      };

      this.sessions.push(session);
    }

    const point = this.makePoint(data);

    session.status = 'CHECKED_IN';
    session.checkInAt = session.checkInAt ?? new Date();
    session.lastLocation = point;
    session.history.push(point);
    session.updatedAt = new Date();

    return session;
  }

  location(data: any) {
    const orderId = data?.orderId;

    const session = this.sessions.find((item) => item.orderId === orderId);

    if (!session) {
      return {
        error: 'TRACKING_NOT_FOUND',
        message: 'Sessao de tracking nao encontrada',
      };
    }

    const point = this.makePoint(data);

    session.status = 'IN_PROGRESS';
    session.lastLocation = point;
    session.history.push(point);
    session.updatedAt = new Date();

    return session;
  }

  checkOut(data: any) {
    const orderId = data?.orderId;

    const session = this.sessions.find((item) => item.orderId === orderId);

    if (!session) {
      return {
        error: 'TRACKING_NOT_FOUND',
        message: 'Sessao de tracking nao encontrada',
      };
    }

    const point = this.makePoint(data);

    session.status = 'CHECKED_OUT';
    session.checkOutAt = new Date();
    session.lastLocation = point;
    session.history.push(point);
    session.proofPhotoUrl = data?.proofPhotoUrl;
    session.note = data?.note;
    session.updatedAt = new Date();

    return session;
  }

  findByOrder(orderId: string) {
    return this.sessions.find((item) => item.orderId === orderId) ?? null;
  }

  findAll() {
    return this.sessions;
  }

  private makePoint(data: any): LocationPoint {
    return {
      latitude: Number(data?.latitude ?? 0),
      longitude: Number(data?.longitude ?? 0),
      createdAt: new Date(),
    };
  }
}
'@ | Set-Content "$tracking\tracking.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly trackingService: TrackingService,
  ) {}

  @Get()
  findAll(): any {
    return this.trackingService.findAll();
  }

  @Get(':orderId')
  findByOrder(
    @Param('orderId') orderId: string,
  ): any {
    return this.trackingService.findByOrder(orderId);
  }

  @Post('check-in')
  checkIn(@Body() body: any): any {
    return this.trackingService.checkIn(body);
  }

  @Post('location')
  location(@Body() body: any): any {
    return this.trackingService.location(body);
  }

  @Post('check-out')
  checkOut(@Body() body: any): any {
    return this.trackingService.checkOut(body);
  }
}
'@ | Set-Content "$tracking\tracking.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
'@ | Set-Content "$tracking\tracking.module.ts" -Encoding UTF8

$appModule = "$backend\src\app.module.ts"
$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "TrackingModule") {
$appContent = $appContent -replace `
"import \{ ReferralModule \} from './referral/referral.module';",
"import { ReferralModule } from './referral/referral.module';
import { TrackingModule } from './tracking/tracking.module';"

$appContent = $appContent -replace `
"ReferralModule,",
"ReferralModule,
    TrackingModule,"

Set-Content $appModule $appContent -Encoding UTF8
}

Write-Host "========================================="
Write-Host "TRACKING + GPS SYSTEM INSTALADO"
Write-Host "========================================="