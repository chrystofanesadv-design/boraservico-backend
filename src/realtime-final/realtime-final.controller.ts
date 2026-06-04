import { Controller, Get } from '@nestjs/common';

@Controller('realtime-final')
export class RealtimeFinalController {
  @Get()
  status() {
    return {
      success: true,
      websocketReady: true,
      liveTrackingReady: true,
      liveChatReady: true,
      realtimeEventsReady: true,
      timestamp: new Date().toISOString(),
    };
  }
}
