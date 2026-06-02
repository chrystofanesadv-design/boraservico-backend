import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  
  // ✅ Rota raiz (teste simples)
  @Get()
  root() {
    return {
      status: 'online',
      service: 'BoraServico API',
      message: 'API rodando corretamente 🚀',
    };
  }

  // ✅ Health check (Railway / monitoramento)
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}