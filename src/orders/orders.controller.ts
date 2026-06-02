import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() body: any): any {
    return this.ordersService.create({
      ...body,
      clientId: body?.clientId ?? req.user?.userId ?? req.user?.id,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(): any {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string): any {
    return this.ordersService.findOne(id);
  }

  @Post('mediated-budget/request')
  @UseGuards(JwtAuthGuard)
  mediatedBudgetRequest(@Req() req: any, @Body() body: any): any {
    return this.ordersService.requestMediatedBudget(req.user, body);
  }

  @Post('contact-filter')
  @UseGuards(JwtAuthGuard)
  filterContact(@Body() body: any): any {
    return this.ordersService.filterContactMessage(body?.message ?? body?.text);
  }

  @Post('photos/validate')
  @UseGuards(JwtAuthGuard)
  validatePhoto(@Body() body: any): any {
    return this.ordersService.validatePhotoAttachment(body);
  }

  @Get(':id/proposals')
  @UseGuards(JwtAuthGuard)
  listProposals(@Param('id') id: string): any {
    return this.ordersService.listProposals(id);
  }

  @Post(':id/proposals')
  @UseGuards(JwtAuthGuard)
  respondProposal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ): any {
    return this.ordersService.respondProposal(id, req.user, body);
  }

  @Post(':id/proposals/:proposalId/accept')
  @UseGuards(JwtAuthGuard)
  acceptProposal(
    @Req() req: any,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: any,
  ): any {
    return this.ordersService.acceptProposal(id, proposalId, req.user, body);
  }

  @Post(':id/proposals/:proposalId/professional-accept')
  @UseGuards(JwtAuthGuard)
  professionalAcceptProposal(
    @Req() req: any,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
  ): any {
    return this.ordersService.professionalAcceptProposal(
      id,
      proposalId,
      req.user,
    );
  }

  @Post(':id/proposals/:proposalId/decline')
  @UseGuards(JwtAuthGuard)
  declineProposal(
    @Req() req: any,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: any,
  ): any {
    return this.ordersService.declineProposal(id, proposalId, req.user, body);
  }

  @Post(':id/proposals/:proposalId/counter')
  @UseGuards(JwtAuthGuard)
  counterProposal(
    @Req() req: any,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: any,
  ): any {
    return this.ordersService.sendNegotiation(id, req.user, {
      ...body,
      proposalId,
    });
  }

  @Post(':id/negotiation')
  @UseGuards(JwtAuthGuard)
  negotiate(@Req() req: any, @Param('id') id: string, @Body() body: any): any {
    return this.ordersService.sendNegotiation(id, req.user, body);
  }

  @Post(':id/proposals/:proposalId/details-request')
  @UseGuards(JwtAuthGuard)
  requestDetails(
    @Req() req: any,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: any,
  ): any {
    return this.ordersService.sendNegotiation(id, req.user, {
      ...body,
      proposalId,
      action: 'REQUEST_DETAILS',
    });
  }

  @Post(':id/agreement')
  @UseGuards(JwtAuthGuard)
  closeAgreement(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ): any {
    return this.ordersService.closeAgreement(id, req.user, body);
  }

  @Get(':id/final-proposal')
  @UseGuards(JwtAuthGuard)
  finalProposal(@Param('id') id: string): any {
    return this.ordersService.finalProposal(id);
  }

  @Post(':id/payment-confirmed')
  @UseGuards(JwtAuthGuard)
  paymentConfirmed(@Param('id') id: string, @Body() body: any): any {
    return this.ordersService.confirmProtectedPayment(id, body);
  }

  @Get(':id/contact-access')
  @UseGuards(JwtAuthGuard)
  contactAccess(@Param('id') id: string): any {
    return this.ordersService.contactAccess(id);
  }

  @Post(':id/accept')
  @UseGuards(JwtAuthGuard)
  accept(@Param('id') id: string, @Body() body: any): any {
    return this.ordersService.accept(id, body?.professionalId);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  start(@Param('id') id: string): any {
    return this.ordersService.start(id);
  }

  @Post(':id/on-the-way')
  @UseGuards(JwtAuthGuard)
  professionalOnTheWay(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ): any {
    return this.ordersService.professionalOnTheWay(id, req.user, body);
  }

  @Post(':id/check-in')
  @UseGuards(JwtAuthGuard)
  checkIn(@Req() req: any, @Param('id') id: string, @Body() body: any): any {
    return this.ordersService.checkIn(id, req.user, body);
  }

  @Post(':id/check-out')
  @UseGuards(JwtAuthGuard)
  checkOut(@Req() req: any, @Param('id') id: string, @Body() body: any): any {
    return this.ordersService.checkOut(id, req.user, body);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  complete(@Param('id') id: string): any {
    return this.ordersService.complete(id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Param('id') id: string): any {
    return this.ordersService.cancel(id);
  }
}
