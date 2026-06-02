import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { NegotiationsService } from './negotiations.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NegotiationsController {
  constructor(private readonly negotiationsService: NegotiationsService) {}

  @Post('request-for-quotes')
  createRequest(@Req() req: any, @Body() body: any) {
    return this.negotiationsService.createRequest(req.user, body);
  }

  @Get('request-for-quotes')
  listClientRequests(@Req() req: any) {
    return this.negotiationsService.listClientRequests(req.user);
  }

  @Get('request-for-quotes/:id')
  getRequest(@Req() req: any, @Param('id') id: string) {
    return this.negotiationsService.getRequestForActor(id, req.user);
  }

  @Get('request-for-quotes/:id/negotiations')
  getRequestNegotiations(@Req() req: any, @Param('id') id: string) {
    return this.negotiationsService.getRequestForActor(id, req.user);
  }

  @Get('negotiations/professional')
  listProfessionalNegotiations(@Req() req: any) {
    return this.negotiationsService.listProfessionalNegotiations(req.user);
  }

  @Get('negotiations/admin')
  listAdminNegotiations(@Req() req: any) {
    return this.negotiationsService.listAdminNegotiations(req.user);
  }

  @Get('negotiations/:id')
  getNegotiation(@Req() req: any, @Param('id') id: string) {
    return this.negotiationsService.getNegotiationForActor(id, req.user);
  }

  @Post('negotiations/:id/quote')
  submitQuote(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.negotiationsService.submitQuote(id, req.user, body);
  }

  @Post('negotiations/:id/counter-offer')
  sendCounterOffer(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.negotiationsService.sendCounterOffer(id, req.user, body);
  }

  @Post('negotiations/:id/final-offer')
  sendFinalOffer(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.negotiationsService.sendFinalOffer(id, req.user, body);
  }

  @Post('negotiations/:id/details')
  requestDetails(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.negotiationsService.requestDetails(id, req.user, body);
  }

  @Post('negotiations/:id/reject')
  rejectNegotiation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.negotiationsService.rejectNegotiation(id, req.user, body);
  }

  @Post('negotiations/:id/accept')
  acceptNegotiation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.negotiationsService.acceptNegotiation(id, req.user, body);
  }

  @Post('negotiations/ai/intermediary-help')
  intermediaryHelp(@Req() req: any, @Body() body: any) {
    return this.negotiationsService.intermediaryHelp(req.user, body);
  }
}
