import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
  ) {}

  @Post('classify')
  classify(@Body() body: any): any {
    return this.aiService.classify(body);
  }

  @Post('price')
  price(@Body() body: any): any {
    return this.aiService.price(body);
  }

  @Post('fraud-risk')
  fraudRisk(@Body() body: any): any {
    return this.aiService.fraudRisk(body);
  }

  @Post('cancel-risk')
  cancelRisk(@Body() body: any): any {
    return this.aiService.cancelRisk(body);
  }

  @Post('conversion')
  conversion(@Body() body: any): any {
    return this.aiService.conversion(body);
  }
}
