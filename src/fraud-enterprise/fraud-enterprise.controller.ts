import { Body, Controller, Get, Post } from '@nestjs/common';
import { FraudEnterpriseService } from './fraud-enterprise.service';
import { FraudCheckDto } from './dto/fraud-check.dto';

@Controller('fraud-enterprise')
export class FraudEnterpriseController {
  constructor(private readonly service: FraudEnterpriseService) {}

  @Post('check')
  check(@Body() dto: FraudCheckDto) {
    return this.service.check(dto);
  }

  @Get('audit')
  audit() {
    return this.service.listAudit();
  }

  @Get('rules')
  rules() {
    return this.service.getRules();
  }
}
