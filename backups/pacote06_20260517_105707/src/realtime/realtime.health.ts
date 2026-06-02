import { Controller, Get } from '@nestjs/common';

@Controller('realtime')
export class RealtimeHealthController {
  @Get()
  status() {
    return {
      success: true,
      module: 'realtime',
      websocket: true,
      timestamp: new Date().toISOString(),
    };
  }
}
