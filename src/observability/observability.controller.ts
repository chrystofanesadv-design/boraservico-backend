import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';

import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
  ) {}

  @Get('health')
  health(): any {
    return this.observabilityService.health();
  }

  @Get('logs')
  logs(): any {
    return this.observabilityService.findLogs();
  }

  @Post('log')
  log(@Body() body: any): any {
    return this.observabilityService.log(body);
  }

  @Get('errors')
  errors(): any {
    return this.observabilityService.findErrors();
  }

  @Post('error')
  error(@Body() body: any): any {
    return this.observabilityService.error(body);
  }

  @Post('autorecovery')
  autoRecovery(@Body() body: any): any {
    return this.observabilityService.autoRecovery(body);
  }
}
