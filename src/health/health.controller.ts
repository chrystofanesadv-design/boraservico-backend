import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'BoraServico Backend',
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }
}
