import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

type OperationalPayload = Record<string, any> & {
  orderId?: string;
  event?: string;
  timestamp?: string;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private static serverRef?: Server;

  private readonly socketOrders = new Map<string, Set<string>>();

  afterInit(server: Server) {
    RealtimeGateway.serverRef = server;
  }

  handleConnection(client: Socket) {
    client.emit('realtime-ready', {
      success: true,
      event: 'realtime-ready',
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    for (const [orderId, sockets] of this.socketOrders.entries()) {
      sockets.delete(client.id);

      if (sockets.size === 0) {
        this.socketOrders.delete(orderId);
      }
    }
  }

  static emitOperational(eventName: string, payload: any = {}) {
    const normalized = RealtimeGateway.normalizePayload(eventName, payload);
    const server = RealtimeGateway.serverRef;

    if (!server) {
      return normalized;
    }

    RealtimeGateway.emitToOrderRooms(server, eventName, normalized);

    if (eventName === 'location-update') {
      RealtimeGateway.emitToOrderRooms(
        server,
        'professional-location',
        normalized,
      );
      RealtimeGateway.emitToOrderRooms(server, 'tracking-update', normalized);
    }

    if (
      eventName !== 'order-event' &&
      eventName !== 'professional-location' &&
      eventName !== 'tracking-update'
    ) {
      RealtimeGateway.emitToOrderRooms(server, 'order-event', {
        ...normalized,
        event: eventName,
      });
    }

    return normalized;
  }

  @SubscribeMessage('join-tracking')
  joinTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    return this.joinOrderRooms(client, body, 'join-tracking');
  }

  @SubscribeMessage('join-order')
  joinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    return this.joinOrderRooms(client, body, 'join-order');
  }

  @SubscribeMessage('location-update')
  locationUpdate(@MessageBody() body: any) {
    return this.publish('location-update', body);
  }

  @SubscribeMessage('professional-location')
  professionalLocation(@MessageBody() body: any) {
    return this.publish('professional-location', body);
  }

  @SubscribeMessage('order-event')
  orderEvent(@MessageBody() body: any) {
    return this.publish('order-event', body);
  }

  @SubscribeMessage('order-status-updated')
  orderStatusUpdated(@MessageBody() body: any) {
    return this.publish('order-status-updated', body);
  }

  @SubscribeMessage('match-found')
  matchFound(@MessageBody() body: any) {
    return this.publish('match-found', body);
  }

  @SubscribeMessage('professional-en-route')
  professionalEnRoute(@MessageBody() body: any) {
    return this.publish('professional-en-route', body);
  }

  @SubscribeMessage('check-in')
  checkIn(@MessageBody() body: any) {
    return this.publish('check-in', body);
  }

  @SubscribeMessage('checkin')
  checkin(@MessageBody() body: any) {
    return this.publish('check-in', body);
  }

  @SubscribeMessage('execution-started')
  executionStarted(@MessageBody() body: any) {
    return this.publish('execution-started', body);
  }

  @SubscribeMessage('service-started')
  serviceStarted(@MessageBody() body: any) {
    return this.publish('execution-started', body);
  }

  @SubscribeMessage('proof-uploaded')
  proofUploaded(@MessageBody() body: any) {
    return this.publish('proof-uploaded', body);
  }

  @SubscribeMessage('proof_sent')
  proofSent(@MessageBody() body: any) {
    return this.publish('proof-uploaded', body);
  }

  @SubscribeMessage('payment-released')
  paymentReleased(@MessageBody() body: any) {
    return this.publish('payment-released', body);
  }

  @SubscribeMessage('payment_released')
  paymentReleasedAlias(@MessageBody() body: any) {
    return this.publish('payment-released', body);
  }

  @SubscribeMessage('dispute-opened')
  disputeOpened(@MessageBody() body: any) {
    return this.publish('dispute-opened', body);
  }

  @SubscribeMessage('dispute')
  disputeAlias(@MessageBody() body: any) {
    return this.publish('dispute-opened', body);
  }

  @SubscribeMessage('order-completed')
  orderCompleted(@MessageBody() body: any) {
    return this.publish('order-completed', body);
  }

  @SubscribeMessage('order_completed')
  orderCompletedAlias(@MessageBody() body: any) {
    return this.publish('order-completed', body);
  }

  @SubscribeMessage('timeline')
  timeline(@MessageBody() body: any) {
    return this.publish('timeline-update', body);
  }

  @SubscribeMessage('tracking')
  tracking(@MessageBody() body: any) {
    return this.publish('tracking-update', body);
  }

  @SubscribeMessage('chat')
  chat(@MessageBody() body: any) {
    const payload = RealtimeGateway.normalizePayload('chat-message', body);

    this.server.emit('chat-message', payload);

    return this.ack('chat-message', payload);
  }

  private joinOrderRooms(client: Socket, body: any, eventName: string) {
    const orderId = this.readOrderId(body);

    if (!orderId) {
      return {
        success: false,
        event: eventName,
        message: 'orderId is required',
        timestamp: new Date().toISOString(),
      };
    }

    client.join(`order-${orderId}`);
    client.join(`tracking-${orderId}`);

    if (!this.socketOrders.has(orderId)) {
      this.socketOrders.set(orderId, new Set());
    }

    this.socketOrders.get(orderId)?.add(client.id);

    return {
      success: true,
      event: eventName,
      orderId,
      timestamp: new Date().toISOString(),
    };
  }

  private publish(eventName: string, body: any) {
    const payload = RealtimeGateway.emitOperational(eventName, body);

    return this.ack(eventName, payload);
  }

  private ack(eventName: string, payload: OperationalPayload) {
    return {
      success: true,
      event: eventName,
      orderId: payload.orderId,
      timestamp: payload.timestamp,
    };
  }

  private readOrderId(body: any) {
    return body?.orderId?.toString().trim() || '';
  }

  private static normalizePayload(eventName: string, payload: any) {
    const source = RealtimeGateway.asObject(payload);
    const orderId = RealtimeGateway.readString(
      source.orderId ?? source.id ?? source.order?.id,
    );
    const timestamp =
      RealtimeGateway.readString(source.timestamp ?? source.updatedAt) ||
      new Date().toISOString();
    const latitude = RealtimeGateway.readNumber(
      source.latitude ?? source.lat,
    );
    const longitude = RealtimeGateway.readNumber(
      source.longitude ?? source.lng,
    );

    const normalized: OperationalPayload = {
      ...source,
      event: eventName,
      timestamp,
    };

    if (orderId) {
      normalized.orderId = orderId;
    }

    if (latitude !== undefined) {
      normalized.latitude = latitude;
      normalized.lat = latitude;
    }

    if (longitude !== undefined) {
      normalized.longitude = longitude;
      normalized.lng = longitude;
    }

    return normalized;
  }

  private static emitToOrderRooms(
    server: Server,
    eventName: string,
    payload: OperationalPayload,
  ) {
    const rooms = RealtimeGateway.roomsFor(payload);

    if (rooms.length === 0) {
      server.emit(eventName, payload);
      return;
    }

    server.to(rooms).emit(eventName, payload);
  }

  private static roomsFor(payload: OperationalPayload) {
    const orderId = payload.orderId?.toString().trim();

    if (!orderId) {
      return [];
    }

    return [`order-${orderId}`, `tracking-${orderId}`];
  }

  private static asObject(value: any) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }

    return {};
  }

  private static readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : '';
  }

  private static readNumber(value: any) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
}
