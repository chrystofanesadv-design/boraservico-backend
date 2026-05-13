import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';

@Controller('wallet')
export class WalletController {

  private balance = 0;

  private transactions: any[] = [];

  @Get()
  getWallet() {
    return {
      balance: this.balance,
    };
  }

  @Post('credit')
  credit(@Body() body: any) {

    const amount = Number(body.amount || 0);

    this.balance += amount;

    this.transactions.push({
      type: 'credit',
      amount,
      createdAt: new Date(),
    });

    return {
      success: true,
      balance: this.balance,
    };
  }

  @Post('debit')
  debit(@Body() body: any) {

    const amount = Number(body.amount || 0);

    this.balance -= amount;

    this.transactions.push({
      type: 'debit',
      amount,
      createdAt: new Date(),
    });

    return {
      success: true,
      balance: this.balance,
    };
  }

  @Get('transactions')
  getTransactions() {
    return this.transactions;
  }
}
