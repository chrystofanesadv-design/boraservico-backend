import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { FinanceEnterpriseService } from './finance-enterprise.service';

@Controller('finance-enterprise')
export class FinanceEnterpriseController {
  constructor(private readonly financeEnterpriseService: FinanceEnterpriseService) {}

  @Get()
  health(): Record<string, unknown> {
    return this.financeEnterpriseService.health();
  }

  @Get('orders/:orderId/summary')
  @UseGuards(JwtAuthGuard)
  summary(@Param('orderId') orderId: string): Promise<any> {
    return this.financeEnterpriseService.getOrderFinancialSummary(orderId);
  }

  @Post('orders/:orderId/waiting-client-confirmation')
  @UseGuards(JwtAuthGuard)
  waitingClientConfirmation(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body() body: any,
  ): Promise<any> {
    return this.financeEnterpriseService.markWaitingClientConfirmation(orderId, {
      ...body,
      actorId: this.resolveUserId(req, body),
    });
  }

  @Post('orders/:orderId/client-confirm-completed')
  @UseGuards(JwtAuthGuard)
  clientConfirmCompleted(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body() body: any,
  ): Promise<any> {
    return this.financeEnterpriseService.clientConfirmServiceCompleted(orderId, {
      ...body,
      clientId: this.resolveUserId(req, body),
    });
  }

  @Post('orders/:orderId/open-financial-dispute')
  @UseGuards(JwtAuthGuard)
  openFinancialDispute(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body() body: any,
  ): Promise<any> {
    return this.financeEnterpriseService.openFinancialDispute(orderId, {
      ...body,
      actorId: this.resolveUserId(req, body),
    });
  }

  @Post('disputes/:disputeId/ai-resolve')
  @UseGuards(JwtAuthGuard)
  aiResolveDispute(
    @Req() req: any,
    @Param('disputeId') disputeId: string,
    @Body() body: any,
  ): Promise<any> {
    return this.financeEnterpriseService.aiResolveDispute(disputeId, {
      ...body,
      actorId: this.resolveUserId(req, body),
    });
  }

  @Post('withdrawals/pix')
  @UseGuards(JwtAuthGuard)
  requestPixWithdrawal(@Req() req: any, @Body() body: any): Promise<any> {
    return this.financeEnterpriseService.requestPixWithdrawal({
      ...body,
      userId: this.resolveUserId(req, body),
    });
  }

  private resolveUserId(req: any, body: any): string | undefined {
    return req?.user?.userId ?? req?.user?.id ?? body?.userId ?? body?.actorId;
  }
}
