import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';

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
  dispatch(@Body() body: any): any {
    return this.matchingService.dispatch(body);
  }

  @Post('accept')
  accept(@Body() body: any): any {
    return this.matchingService.accept(body);
  }

  @Post('reject')
  reject(@Body() body: any): any {
    return this.matchingService.reject(body);
  }
}
