import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { DisputesService } from './disputes.service';

@Controller('disputes')
export class DisputesController {
  constructor(private readonly service: DisputesService) {}

  // 📌 listar todas disputas (ADMIN DASHBOARD)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // 📌 ver disputa específica
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // 📌 abrir disputa (cliente/profissional)
  @Post()
  create(@Body() body: any) {
    return this.service.createDispute(body);
  }

  // 📌 cliente responde
  @Post(':id/client')
  client(
    @Param('id') id: string,
    @Body('message') message: string,
  ) {
    return this.service.clientResponse(id, message);
  }

  // 📌 profissional responde
  @Post(':id/professional')
  professional(
    @Param('id') id: string,
    @Body('message') message: string,
  ) {
    return this.service.professionalResponse(id, message);
  }

  // 📌 🔥 ADMIN RESOLVE DISPUTA (CORE DO DASHBOARD)
  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: { decision: 'CLIENT_WINS' | 'PROFESSIONAL_WINS' | 'PARTIAL_REFUND' },
  ) {
    return this.service.resolve(id, body.decision);
  }

  // 📌 🔥 OVERRIDE TOTAL (ADMIN FORÇA DECISÃO FINAL)
  @Post(':id/override')
  override(
    @Param('id') id: string,
    @Body() body: { decision: string },
  ) {
    return this.service.forceResolve(id, body);
  }
}