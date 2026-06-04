import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard } from '../security/admin.guard';
import { Roles } from '../security/roles.decorator';
import { GrowthAiStudioService } from './growth-ai-studio.service';

@Controller('growth-ai-studio')
@UseGuards(JwtAuthGuard, AdminGuard)
@Roles('ADMIN')
export class GrowthAiStudioController {
  constructor(private readonly growthAiStudioService: GrowthAiStudioService) {}

  @Get()
  status() {
    return this.growthAiStudioService.status();
  }

  @Post('campaigns/generate')
  generateCampaign(@Body() body: any, @Req() req: any) {
    return this.growthAiStudioService.generateCampaign(body, req.user);
  }

  @Get('campaigns')
  listCampaigns(@Query() query: any) {
    return this.growthAiStudioService.listCampaigns(query);
  }

  @Patch('campaigns/:id/approve')
  approveCampaign(@Param('id') id: string) {
    return this.growthAiStudioService.approveCampaign(id);
  }

  @Patch('campaigns/:id/published')
  markPublished(@Param('id') id: string, @Body() body: any) {
    return this.growthAiStudioService.markPublished(id, body);
  }

  @Get('campaigns/:id/download')
  downloadBundle(@Param('id') id: string) {
    return this.growthAiStudioService.downloadBundle(id);
  }

  @Get('campaigns/:id/publish-links')
  publishLinks(@Param('id') id: string) {
    return this.growthAiStudioService.publishLinks(id);
  }
}