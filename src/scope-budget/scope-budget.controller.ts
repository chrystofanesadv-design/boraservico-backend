import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { ScopeBudgetService } from './scope-budget.service';

@Controller('scope-budget')
@UseGuards(JwtAuthGuard)
export class ScopeBudgetController {
  constructor(private readonly scopeBudgetService: ScopeBudgetService) {}

  @Post('build-scope')
  buildScope(@Body() body: any) {
    return this.scopeBudgetService.buildScope(body);
  }

  @Post('fair-price')
  fairPrice(@Body() body: any) {
    return this.scopeBudgetService.fairPrice(body);
  }

  @Post('compare-proposals')
  compareProposals(@Body() body: any) {
    return this.scopeBudgetService.compareProposals(body);
  }
}
