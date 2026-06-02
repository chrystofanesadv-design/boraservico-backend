import { Module } from '@nestjs/common';
import { ScopeBudgetController } from './scope-budget.controller';
import { ScopeBudgetService } from './scope-budget.service';

@Module({
  controllers: [ScopeBudgetController],
  providers: [ScopeBudgetService],
  exports: [ScopeBudgetService],
})
export class ScopeBudgetModule {}
