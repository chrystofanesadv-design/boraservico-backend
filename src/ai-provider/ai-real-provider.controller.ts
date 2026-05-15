import { Body, Controller, Post } from '@nestjs/common';
import { AiRealProviderService } from './ai-real-provider.service';

@Controller('ai-provider')
export class AiRealProviderController {
  constructor(private readonly service: AiRealProviderService) {}

  @Post('classify')
  classify(@Body() body: any) {
    return this.service.classify(body);
  }

  @Post('price')
  price(@Body() body: any) {
    return this.service.price(body);
  }
}
