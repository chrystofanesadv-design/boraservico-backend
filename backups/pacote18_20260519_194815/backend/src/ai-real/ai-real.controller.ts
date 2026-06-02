import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AiRealService } from './ai-real.service';

@Controller('ai-real')
export class AiRealController {
  constructor(private readonly service: AiRealService) {}

  @Get()
  status() {
    return this.service.status();
  }

  @Post('classify')
  @UseGuards(JwtAuthGuard)
  classify(@Body() body: any) {
    return this.service.classify(body);
  }

  @Post('price')
  @UseGuards(JwtAuthGuard)
  price(@Body() body: any) {
    return this.service.smartPrice(body);
  }

  @Post('fraud-risk')
  @UseGuards(JwtAuthGuard)
  fraudRisk(@Body() body: any) {
    return this.service.fraudRisk(body);
  }

  @Post('conversion')
  @UseGuards(JwtAuthGuard)
  conversion(@Body() body: any) {
    return this.service.conversion(body);
  }

  @Post('cancellation')
  @UseGuards(JwtAuthGuard)
  cancellation(@Body() body: any) {
    return this.service.cancellation(body);
  }
}
