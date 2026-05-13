Write-Host "========================================="
Write-Host "INSTALANDO OS TIMELINE SYSTEM"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$timeline = "$backend\src\timeline"

New-Item -ItemType Directory -Force -Path $timeline | Out-Null

@'
import { Injectable } from '@nestjs/common';

type TimelineEventType =
  | 'CREATED'
  | 'MATCHING_STARTED'
  | 'PROFESSIONAL_ACCEPTED'
  | 'PROFESSIONAL_ON_THE_WAY'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTE_OPENED';

interface TimelineEvent {
  id: string;
  orderId: string;
  type: TimelineEventType;
  title: string;
  description: string;
  latitude?: number;
  longitude?: number;
  proofPhotoUrl?: string;
  createdAt: Date;
}

@Injectable()
export class TimelineService {
  private events: TimelineEvent[] = [];

  findByOrder(orderId: string) {
    return this.events
      .filter((event) => event.orderId === orderId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  createEvent(data: any) {
    const event: TimelineEvent = {
      id: crypto.randomUUID(),
      orderId: data?.orderId,
      type: data?.type ?? 'CREATED',
      title: data?.title ?? 'Evento da OS',
      description: data?.description ?? '',
      latitude: data?.latitude !== undefined ? Number(data.latitude) : undefined,
      longitude: data?.longitude !== undefined ? Number(data.longitude) : undefined,
      proofPhotoUrl: data?.proofPhotoUrl,
      createdAt: new Date(),
    };

    this.events.push(event);

    return event;
  }

  checkIn(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'CHECKED_IN',
      title: 'Profissional chegou ao local',
      description: data?.description ?? 'Check-in confirmado com localização GPS.',
      latitude: data?.latitude,
      longitude: data?.longitude,
    });
  }

  checkOut(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'CHECKED_OUT',
      title: 'Serviço finalizado no local',
      description: data?.description ?? 'Check-out confirmado com prova de execução.',
      latitude: data?.latitude,
      longitude: data?.longitude,
      proofPhotoUrl: data?.proofPhotoUrl,
    });
  }

  complete(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'COMPLETED',
      title: 'OS concluída',
      description: data?.description ?? 'Serviço concluído e pronto para liberação de pagamento.',
    });
  }

  seedDemo(orderId: string) {
    const created = this.createEvent({
      orderId,
      type: 'CREATED',
      title: 'OS criada',
      description: 'Cliente criou uma nova ordem de serviço.',
    });

    const matching = this.createEvent({
      orderId,
      type: 'MATCHING_STARTED',
      title: 'Buscando profissional',
      description: 'Matching Engine iniciou a busca por profissionais próximos.',
    });

    const accepted = this.createEvent({
      orderId,
      type: 'PROFESSIONAL_ACCEPTED',
      title: 'Profissional aceitou',
      description: 'Profissional aceitou a ordem e está a caminho.',
    });

    return {
      success: true,
      events: [created, matching, accepted],
    };
  }

  findAll() {
    return this.events;
  }
}
'@ | Set-Content "$timeline\timeline.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { TimelineService } from './timeline.service';

@Controller('timeline')
export class TimelineController {
  constructor(
    private readonly timelineService: TimelineService,
  ) {}

  @Get()
  findAll(): any {
    return this.timelineService.findAll();
  }

  @Get(':orderId')
  findByOrder(@Param('orderId') orderId: string): any {
    return this.timelineService.findByOrder(orderId);
  }

  @Post('event')
  createEvent(@Body() body: any): any {
    return this.timelineService.createEvent(body);
  }

  @Post('check-in')
  checkIn(@Body() body: any): any {
    return this.timelineService.checkIn(body);
  }

  @Post('check-out')
  checkOut(@Body() body: any): any {
    return this.timelineService.checkOut(body);
  }

  @Post('complete')
  complete(@Body() body: any): any {
    return this.timelineService.complete(body);
  }

  @Post('demo/:orderId')
  seedDemo(@Param('orderId') orderId: string): any {
    return this.timelineService.seedDemo(orderId);
  }
}
'@ | Set-Content "$timeline\timeline.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';

@Module({
  controllers: [TimelineController],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
'@ | Set-Content "$timeline\timeline.module.ts" -Encoding UTF8

$appModule = "$backend\src\app.module.ts"
$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "TimelineModule") {

$appContent = $appContent -replace `
"import \{ ObservabilityModule \} from './observability/observability.module';",
"import { ObservabilityModule } from './observability/observability.module';
import { TimelineModule } from './timeline/timeline.module';"

$appContent = $appContent -replace `
"ObservabilityModule,",
"ObservabilityModule,
    TimelineModule,"

Set-Content $appModule $appContent -Encoding UTF8
}

Write-Host "========================================="
Write-Host "OS TIMELINE SYSTEM INSTALADO"
Write-Host "========================================="