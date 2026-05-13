Write-Host "========================================="
Write-Host "INSTALANDO MATCHING ENGINE BORASERVICO"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$matching = "$backend\src\matching"

New-Item -ItemType Directory -Force -Path $matching | Out-Null

@'
import { Injectable } from '@nestjs/common';

interface ProfessionalMock {
  id: string;
  name: string;
  category: string;
  rating: number;
  distanceKm: number;
  online: boolean;
  priority: number;
}

interface DispatchMock {
  id: string;
  orderId: string;
  category: string;
  status: 'DISPATCHED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  radiusKm: number;
  professionals: ProfessionalMock[];
  selectedProfessionalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MatchingService {
  private professionals: ProfessionalMock[] = [
    {
      id: 'profissional-1',
      name: 'Carlos Eletricista',
      category: 'elétrica',
      rating: 4.9,
      distanceKm: 1.2,
      online: true,
      priority: 100,
    },
    {
      id: 'profissional-2',
      name: 'João Reparos',
      category: 'elétrica',
      rating: 4.7,
      distanceKm: 2.4,
      online: true,
      priority: 90,
    },
    {
      id: 'profissional-3',
      name: 'Ana Limpeza',
      category: 'limpeza',
      rating: 4.8,
      distanceKm: 1.8,
      online: true,
      priority: 95,
    },
  ];

  private dispatches: DispatchMock[] = [];

  listProfessionals() {
    return this.professionals;
  }

  dispatch(data: any) {
    const category = data?.category ?? 'elétrica';
    const radiusKm = Number(data?.radiusKm ?? 5);

    const matchedProfessionals = this.professionals
      .filter((professional) => professional.online)
      .filter((professional) => professional.distanceKm <= radiusKm)
      .filter((professional) => professional.category === category)
      .sort((a, b) => b.priority - a.priority || b.rating - a.rating);

    const dispatch: DispatchMock = {
      id: crypto.randomUUID(),
      orderId: data?.orderId ?? crypto.randomUUID(),
      category,
      radiusKm,
      status: 'DISPATCHED',
      professionals: matchedProfessionals,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.dispatches.push(dispatch);

    return dispatch;
  }

  accept(data: any) {
    const dispatch = this.dispatches.find((item) => item.id === data?.dispatchId);

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Disparo não encontrado',
      };
    }

    dispatch.status = 'ACCEPTED';
    dispatch.selectedProfessionalId = data?.professionalId;
    dispatch.updatedAt = new Date();

    return dispatch;
  }

  reject(data: any) {
    const dispatch = this.dispatches.find((item) => item.id === data?.dispatchId);

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Disparo não encontrado',
      };
    }

    dispatch.status = 'REJECTED';
    dispatch.updatedAt = new Date();

    return dispatch;
  }

  listDispatches() {
    return this.dispatches;
  }
}
'@ | Set-Content "$matching\matching.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';

import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('professionals')
  listProfessionals(): any {
    return this.matchingService.listProfessionals();
  }

  @Get('dispatches')
  listDispatches(): any {
    return this.matchingService.listDispatches();
  }

  @Post('dispatch')
  dispatch(@Body() body: any): any {
    return this.matchingService.dispatch(body);
  }

  @Post('accept')
  accept(@Body() body: any): any {
    return this.matchingService.accept(body);
  }

  @Post('reject')
  reject(@Body() body: any): any {
    return this.matchingService.reject(body);
  }
}
'@ | Set-Content "$matching\matching.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
'@ | Set-Content "$matching\matching.module.ts" -Encoding UTF8

Write-Host "========================================="
Write-Host "MATCHING ENGINE INSTALADO"
Write-Host "========================================="