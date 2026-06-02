import { Controller, Get } from '@nestjs/common';

const operationalEvents = [
  'join-tracking',
  'location-update',
  'professional-location',
  'order-event',
  'order-status-updated',
  'match-found',
  'check-in',
  'proof-uploaded',
  'payment-released',
  'dispute-opened',
  'order-completed',
];

@Controller('realtime')
export class RealtimeHealthController {
  @Get()
  status() {
    return {
      success: true,
      module: 'realtime',
      websocket: true,
      events: operationalEvents,
      timestamp: new Date().toISOString(),
    };
  }
}
