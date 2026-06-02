import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

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

  @Get('dispatches/:id')
  getDispatch(@Param('id') id: string): any {
    return this.matchingService.findDispatch(id);
  }

  @Post('dispatch')
  @UseGuards(JwtAuthGuard)
  dispatch(@Body() body: any): any {
    return this.matchingService.dispatch(body);
  }

  @Post('dispatches/:id/expand')
  @UseGuards(JwtAuthGuard)
  expand(@Param('id') id: string, @Body() body: any): any {
    return this.matchingService.expand({ ...body, dispatchId: id });
  }

  @Post('dispatches/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Param('id') id: string, @Body() body: any): any {
    return this.matchingService.cancel({ ...body, dispatchId: id });
  }

  @Post('dispatches/:id/proposals')
  @UseGuards(JwtAuthGuard)
  receiveProposal(@Param('id') id: string, @Body() body: any): any {
    return this.matchingService.receiveProposal({ ...body, dispatchId: id });
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
