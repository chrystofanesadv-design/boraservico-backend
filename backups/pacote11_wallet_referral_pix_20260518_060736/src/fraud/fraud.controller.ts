import { Body, Controller, Post } from '@nestjs/common';
import { FraudService } from './fraud.service';

@Controller('fraud')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Post('analyze')
  analyze(@Body() body: any) {
    return this.fraudService.analyze(body);
  }
}
