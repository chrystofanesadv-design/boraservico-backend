import { Body, Controller, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AiRealProviderService } from './ai-real-provider.service';

@Controller('ai-provider')
export class AiRealProviderController {
  constructor(private readonly service: AiRealProviderService) {}

  @Post('classify')
  @UseGuards(JwtAuthGuard)
  classify(@Body() body: any) {
    return this.service.classify(body);
  }

  @Post('price')
  @UseGuards(JwtAuthGuard)
  price(@Body() body: any) {
    return this.service.price(body);
  }
}
