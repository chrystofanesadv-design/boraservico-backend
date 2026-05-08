import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  healthCheck() {
    return {
      status: 'online',
      message: 'BoraServico API funcionando 🚀',
      timestamp: new Date().toISOString(),
    };
  }
}