import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('professionals')
  listProfessionals(): any {
    return this.matchingService.listProfessionals();
  }

  @Get('dispatches')
  listDispatches(): any {
    return this.matchingService.listDispatches();
  }

  @Post('dispatch')
  @UseGuards(JwtAuthGuard)
  dispatch(@Body() body: any): any {
    return this.matchingService.dispatch(body);
  }

  @Post('accept')
  @UseGuards(JwtAuthGuard)
  accept(@Body() body: any): any {
    return this.matchingService.accept(body);
  }

  @Post('reject')
  @UseGuards(JwtAuthGuard)
  reject(@Body() body: any): any {
    return this.matchingService.reject(body);
  }
}
