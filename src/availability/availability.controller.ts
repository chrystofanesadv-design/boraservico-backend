import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AvailabilityService } from './availability.service';

@Controller('availability')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('me')
  me(@Req() req: any) {
    return this.availabilityService.listForProfessional(req.user?.id);
  }

  @Post('me')
  save(@Req() req: any, @Body() body: any) {
    return this.availabilityService.saveForProfessional(req.user?.id, body);
  }

  @Post('suggest')
  suggest(@Body() body: any) {
    return this.availabilityService.suggestForRequest(body);
  }
}

