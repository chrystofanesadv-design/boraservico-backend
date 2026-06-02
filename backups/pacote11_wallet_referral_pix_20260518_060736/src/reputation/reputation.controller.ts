import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { ReputationService } from './reputation.service';

@Controller('reputation')
export class ReputationController {
  constructor(
    private readonly reputationService: ReputationService,
  ) {}

  @Get()
  findAll(): any {
    return this.reputationService.findAll();
  }

  @Get(':userId')
  findOne(
    @Param('userId') userId: string,
  ): any {
    return this.reputationService.findOne(userId);
  }

  @Post('review')
  review(@Body() body: any): any {
    return this.reputationService.review(body);
  }

  @Post('cancel')
  cancel(@Body() body: any): any {
    return this.reputationService.registerCancellation(body);
  }

  @Post('response-time')
  responseTime(
    @Body() body: any,
  ): any {
    return this.reputationService.registerResponseTime(body);
  }
}
