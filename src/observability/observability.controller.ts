import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard } from '../security/admin.guard';
import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get()
  root(): any {
    return this.observabilityService.health();
  }
  @Get('health')
  health(): any {
    return this.observabilityService.health();
  }

  @Get('production-ready')
  productionReady(): any {
    return this.observabilityService.productionReady();
  }

  @Get('env')
  @UseGuards(JwtAuthGuard, AdminGuard)
  env(): any {
    return this.observabilityService.envStatus();
  }

  @Get('database')
  @UseGuards(JwtAuthGuard, AdminGuard)
  database(): any {
    return this.observabilityService.databaseStatus();
  }

  @Get('realtime')
  @UseGuards(JwtAuthGuard, AdminGuard)
  realtime(): any {
    return this.observabilityService.realtimeStatus();
  }

  @Get('payments')
  @UseGuards(JwtAuthGuard, AdminGuard)
  payments(): any {
    return this.observabilityService.paymentsStatus();
  }

  @Get('firebase')
  @UseGuards(JwtAuthGuard, AdminGuard)
  firebase(): any {
    return this.observabilityService.firebaseStatus();
  }

  @Get('storage')
  @UseGuards(JwtAuthGuard, AdminGuard)
  storage(): any {
    return this.observabilityService.storageStatus();
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  logs(@Query('take') take?: string): any {
    return this.observabilityService.findLogs(Number(take ?? 100));
  }

  @Post('log')
  @UseGuards(JwtAuthGuard, AdminGuard)
  log(@Body() body: any): any {
    return this.observabilityService.log(body);
  }

  @Get('errors')
  @UseGuards(JwtAuthGuard, AdminGuard)
  errors(@Query('take') take?: string): any {
    return this.observabilityService.findErrors(Number(take ?? 100));
  }

  @Post('error')
  @UseGuards(JwtAuthGuard, AdminGuard)
  error(@Body() body: any): any {
    return this.observabilityService.error(body);
  }

  @Post('autorecovery')
  @UseGuards(JwtAuthGuard, AdminGuard)
  autoRecovery(@Body() body: any): any {
    return this.observabilityService.autoRecovery(body);
  }
}

