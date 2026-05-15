import { Body, Controller, Get, Post } from '@nestjs/common';
import { AiRealService } from './ai-real.service';

@Controller('ai-real')
export class AiRealController {
  constructor(private readonly service: AiRealService) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'ai-real',
      geminiReady: Boolean(process.env.GEMINI_API_KEY),
      openAiReady: Boolean(process.env.OPENAI_API_KEY),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('classify')
  classify(@Body() body: any) {
    return this.service.classify(body);
  }

  @Post('price')
  price(@Body() body: any) {
    return this.service.smartPrice(body);
  }

  @Post('fraud-risk')
  fraudRisk(@Body() body: any) {
    return this.service.fraudRisk(body);
  }

  @Post('conversion')
  conversion(@Body() body: any) {
    return this.service.conversion(body);
  }

  @Post('cancellation')
  cancellation(@Body() body: any) {
    return this.service.cancellation(body);
  }
}
