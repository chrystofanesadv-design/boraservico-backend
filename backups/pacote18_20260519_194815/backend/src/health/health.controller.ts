import { Controller, Get } from '@nestjs/common';

import { ObservabilityService } from '../observability/observability.service';

@Controller('health')
export class HealthController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get()
  health(): any {
    return this.observabilityService.health();
  }

  @Get('advanced')
  advanced(): any {
    return this.observabilityService.health();
  }

  @Get('ready')
  ready(): any {
    return this.observabilityService.productionReady();
  }
}
