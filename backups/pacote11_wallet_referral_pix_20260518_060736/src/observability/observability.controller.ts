import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('health')
  health(): any {
    return this.observabilityService.health();
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  logs(): any {
    return this.observabilityService.findLogs();
  }

  @Post('log')
  @UseGuards(JwtAuthGuard)
  log(@Body() body: any): any {
    return this.observabilityService.log(body);
  }

  @Get('errors')
  @UseGuards(JwtAuthGuard)
  errors(): any {
    return this.observabilityService.findErrors();
  }

  @Post('error')
  @UseGuards(JwtAuthGuard)
  error(@Body() body: any): any {
    return this.observabilityService.error(body);
  }

  @Post('autorecovery')
  @UseGuards(JwtAuthGuard)
  autoRecovery(@Body() body: any): any {
    return this.observabilityService.autoRecovery(body);
  }
}
