import { Controller, Get } from '@nestjs/common';
import { getPublicEnvReadiness } from '../config/env';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    const env = getPublicEnvReadiness();

    return {
      status: 'ok',
      service: 'BoraServico Backend',
      productionReady: env.productionReady,
      env,
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }
}
