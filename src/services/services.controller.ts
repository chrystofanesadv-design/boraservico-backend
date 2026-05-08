import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ServicesService } from './services.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
  ) {}

  // 🚀 criar serviço
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Req() req,
    @Body() body: any,
  ) {
    return this.servicesService.create({
      clientId: req.user.userId,
      ...body,
    });
  }

  // 📌 listar serviços
  @Get()
  findAll() {
    return this.servicesService.findAll();
  }
}