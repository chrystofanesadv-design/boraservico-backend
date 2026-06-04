import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard } from '../security/admin.guard';
import { Roles } from '../security/roles.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('install')
  registerInstall(@Body() body: any) {
    return this.analyticsService.registerInstall(body);
  }

  @Get('downloads')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Roles('ADMIN')
  downloadsSummary() {
    return this.analyticsService.downloadsSummary();
  }
}