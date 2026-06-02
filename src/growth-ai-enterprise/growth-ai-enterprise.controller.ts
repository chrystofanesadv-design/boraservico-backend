import { Body, Controller, Get, Post } from '@nestjs/common';
import { CityGrowthSignalDto, GrowthCampaignRequestDto, ViralScoreRequestDto } from './growth-ai-enterprise.dto';
import { GrowthAiEnterpriseService } from './growth-ai-enterprise.service';

@Controller('growth-ai-enterprise')
export class GrowthAiEnterpriseController {
  constructor(private readonly growthAiEnterpriseService: GrowthAiEnterpriseService) {}

  @Get()
  health(): Record<string, unknown> {
    return this.growthAiEnterpriseService.health();
  }

  @Get('dashboard')
  dashboard(): Record<string, unknown> {
    return this.growthAiEnterpriseService.dashboard();
  }

  @Post('campaigns/generate')
  createCampaign(@Body() payload: GrowthCampaignRequestDto): Record<string, unknown> {
    return this.growthAiEnterpriseService.createCampaign(payload);
  }

  @Post('cities/rank')
  rankCities(@Body() payload: { signals?: CityGrowthSignalDto[] }): Record<string, unknown> {
    return this.growthAiEnterpriseService.rankCities(payload.signals ?? []);
  }

  @Post('viral-score')
  viralScore(@Body() payload: ViralScoreRequestDto): Record<string, unknown> {
    return this.growthAiEnterpriseService.calculateViralScore(payload);
  }
}
