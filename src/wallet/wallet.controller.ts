import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getWallet(@Req() req: any, @Query('userId') userId?: string) {
    return this.walletService.getWallet(this.resolveUserId(req, { userId }));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyWallet(@Req() req: any) {
    return this.walletService.getWallet(this.resolveUserId(req, {}));
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  async getTransactions(
    @Req() req: any,
    @Query('userId') userId?: string,
    @Query('take') take?: string,
  ) {
    return this.walletService.getTransactions(
      this.resolveUserId(req, { userId }),
      this.readTake(take),
    );
  }

  @Post('credit')
  @UseGuards(JwtAuthGuard)
  async credit(@Req() req: any, @Body() body: any) {
    const payload = await this.walletService.credit({
      ...body,
      userId: this.resolveUserId(req, body),
    });

    return this.emitWalletUpdate(payload);
  }

  @Post('debit')
  @UseGuards(JwtAuthGuard)
  async debit(@Req() req: any, @Body() body: any) {
    const payload = await this.walletService.debit({
      ...body,
      userId: this.resolveUserId(req, body),
    });

    return this.emitWalletUpdate(payload);
  }

  @Post('release')
  @UseGuards(JwtAuthGuard)
  async release(@Req() req: any, @Body() body: any) {
    const payload = await this.walletService.release({
      ...body,
      userId: this.resolveUserId(req, body),
    });

    RealtimeGateway.emitOperational('payment-released', {
      ...payload,
      orderId: body?.orderId,
      message: payload.statusLabel,
      timestamp: payload.updatedAt,
    });

    return payload;
  }

  @Post('withdraw-pix')
  @UseGuards(JwtAuthGuard)
  async withdrawPix(@Req() req: any, @Body() body: any) {
    const payload = await this.walletService.withdrawPix({
      ...body,
      userId: this.resolveUserId(req, body),
    });

    return this.emitWalletUpdate(payload);
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  async withdraw(@Req() req: any, @Body() body: any) {
    return this.withdrawPix(req, body);
  }

  private emitWalletUpdate(payload: Record<string, any>) {
    RealtimeGateway.emitOperational('wallet-update', {
      ...payload,
      message: payload.statusLabel,
      timestamp: payload.updatedAt,
    });

    return payload;
  }

  private resolveUserId(req: any, data: any) {
    return req?.user?.userId ?? req?.user?.id ?? data?.userId;
  }

  private readTake(value: any) {
    const take = Number(value ?? 100);
    return Number.isFinite(take) ? Math.min(Math.max(take, 1), 200) : 100;
  }
}
