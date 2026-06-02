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
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { DisputesService } from './disputes.service';

@Controller('disputes')
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  findAll(): any {
    return this.disputesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): any {
    return this.disputesService.findOne(id);
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateDisputeDto): any {
    return this.disputesService.create({
      ...body,
      clientId: body?.clientId ?? req.user?.userId,
    });
  }

  @Post(':id/client')
  clientEvidence(@Param('id') id: string, @Body() body: any): any {
    return this.disputesService.addClientEvidence(id, body);
  }

  @Post(':id/professional')
  professionalEvidence(@Param('id') id: string, @Body() body: any): any {
    return this.disputesService.addProfessionalEvidence(id, body);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body() body: any): any {
    return this.disputesService.resolve(id, body);
  }

  @Post(':id/override')
  override(@Param('id') id: string, @Body() body: any): any {
    return this.disputesService.override(id, body);
  }
}
