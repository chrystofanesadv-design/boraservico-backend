import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { DealAiService } from './deal-ai.service';

@Controller('deal-ai')
@UseGuards(JwtAuthGuard)
export class DealAiController {
  constructor(private readonly dealAiService: DealAiService) {}

  @Post('best-agreement')
  bestAgreement(@Body() body: any) {
    return this.dealAiService.bestAgreement(body);
  }

  @Post('urgency-strategy')
  urgencyStrategy(@Body() body: any) {
    return this.dealAiService.urgencyStrategy(body);
  }

  @Post('time-auction')
  timeAuction(@Body() body: any) {
    return this.dealAiService.timeAuction(body);
  }
}
