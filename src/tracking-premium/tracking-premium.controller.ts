import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TrackingPremiumActionDto, TrackingPremiumLocationDto, TrackingPremiumMissionDto } from './tracking-premium.dto';
import type { TrackingPremiumMission } from './tracking-premium.service';
import { TrackingPremiumService } from './tracking-premium.service';

@Controller('tracking-premium')
export class TrackingPremiumController {
  constructor(private readonly trackingPremiumService: TrackingPremiumService) {}

  @Get()
  health(): Record<string, unknown> {
    return this.trackingPremiumService.health();
  }

  @Get('missions')
  list(): TrackingPremiumMission[] {
    return this.trackingPremiumService.list();
  }

  @Get('missions/:orderId')
  get(@Param('orderId') orderId: string): TrackingPremiumMission {
    return this.trackingPremiumService.get(orderId);
  }

  @Post('missions')
  upsertMission(@Body() payload: TrackingPremiumMissionDto): TrackingPremiumMission {
    return this.trackingPremiumService.upsertMission(payload);
  }

  @Post('location')
  updateLocation(@Body() payload: TrackingPremiumLocationDto): TrackingPremiumMission {
    return this.trackingPremiumService.updateLocation(payload);
  }

  @Post('missions/:orderId/on-the-way')
  markOnTheWay(@Param('orderId') orderId: string): TrackingPremiumMission {
    return this.trackingPremiumService.markOnTheWay(orderId);
  }

  @Post('check-in')
  checkIn(@Body() payload: TrackingPremiumActionDto): TrackingPremiumMission {
    return this.trackingPremiumService.checkIn(payload);
  }

  @Post('check-out')
  checkOut(@Body() payload: TrackingPremiumActionDto): TrackingPremiumMission {
    return this.trackingPremiumService.checkOut(payload);
  }
}
