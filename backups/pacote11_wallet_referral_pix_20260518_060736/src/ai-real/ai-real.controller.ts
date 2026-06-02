import { Body, Controller, Get, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { readEnv } from '../config/env';
import { AiRealService } from './ai-real.service';

@Controller('ai-real')
export class AiRealController {
  constructor(private readonly service: AiRealService) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'ai-real',
      geminiReady: Boolean(readEnv('GEMINI_API_KEY')),
      openAiReady: Boolean(readEnv('OPENAI_API_KEY')),
      timestamp: new Date().toISOString(),
    };
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
