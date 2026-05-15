import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('timeline')
  timeline(@MessageBody() body: any) {
    this.server.emit('timeline-update', {
      success: true,
      event: 'timeline-update',
      body,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      realtime: true,
    };
  }

  @SubscribeMessage('tracking')
  tracking(@MessageBody() body: any) {
    this.server.emit('tracking-update', {
      success: true,
      event: 'tracking-update',
      body,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      tracking: true,
    };
  }

  @SubscribeMessage('chat')
  chat(@MessageBody() body: any) {
    this.server.emit('chat-message', {
      success: true,
      event: 'chat-message',
      body,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      chat: true,
    };
  }
}
