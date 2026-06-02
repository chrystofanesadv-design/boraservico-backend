import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ProfessionalProfileService } from './professional-profile.service';

@Controller('professional-profile')
export class ProfessionalProfileController {
  constructor(private readonly service: ProfessionalProfileService) {}

  @Get(':professionalId')
  findOne(@Param('professionalId') professionalId: string) {
    return this.service.findOne(professionalId);
  }

  @Post(':professionalId/verification')
  requestVerification(
    @Param('professionalId') professionalId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.requestVerification(professionalId, body);
  }

  @Post(':professionalId/reviews')
  createReview(
    @Param('professionalId') professionalId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createReview(professionalId, body);
  }

  @Patch(':professionalId/trust-summary')
  updateTrustSummary(
    @Param('professionalId') professionalId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateTrustSummary(professionalId, body);
  }
}
