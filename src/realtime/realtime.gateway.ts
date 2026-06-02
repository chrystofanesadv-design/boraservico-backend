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

import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

import { ChatService } from '../chat/chat.service';
import { isAllowedCorsOrigin } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

type OperationalPayload = Record<string, any> & {
  orderId?: string;
  event?: string;
  timestamp?: string;
};

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Socket CORS origin not allowed: ${origin}`), false);
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private static serverRef?: Server;

  private readonly socketOrders = new Map<string, Set<string>>();
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    RealtimeGateway.serverRef = server;
  }

  handleConnection(client: Socket) {
    const user = this.authenticateSocket(client);

    if (!user?.userId) {
      client.emit('realtime-error', {
        success: false,
        event: 'unauthorized',
        message: 'JWT obrigatorio para realtime',
        timestamp: new Date().toISOString(),
      });
      client.disconnect(true);
      return;
    }

    client.data.user = user;
    this.addPresence(user.userId, client.id);
    client.join(`user-${user.userId}`);
    client.join(`role-${(user.role ?? 'CLIENT').toUpperCase()}`);
    client.emit('realtime-ready', {
      success: true,
      event: 'realtime-ready',
      authenticated: true,
      userId: user.userId,
      timestamp: new Date().toISOString(),
    });
    this.emitPresence(user.userId, true);
  }

  handleDisconnect(client: Socket) {
    for (const [orderId, sockets] of this.socketOrders.entries()) {
      sockets.delete(client.id);

      if (sockets.size === 0) {
        this.socketOrders.delete(orderId);
      }
    }

    const userId = RealtimeGateway.readString(client.data.user?.userId);

    if (userId) {
      const sockets = this.userSockets.get(userId);
      sockets?.delete(client.id);

      if (!sockets || sockets.size === 0) {
        this.userSockets.delete(userId);
        this.emitPresence(userId, false);
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
  async joinTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    return this.joinOrderRooms(client, body, 'join-tracking');
  }

  @SubscribeMessage('join-order')
  async joinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    return this.joinOrderRooms(client, body, 'join-order');
  }

  @SubscribeMessage('register')
  register(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    const actor = this.requireSocketUser(client);
    const role = RealtimeGateway.readString(body?.role ?? actor.role);

    if (role) {
      client.join(`role-${role.toUpperCase()}`);
    }

    return {
      success: true,
      event: 'register',
      userId: actor.userId,
      role: role || actor.role,
      online: true,
      timestamp: new Date().toISOString(),
    };
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
  chat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    return this.chatMessage(client, body);
  }

  @SubscribeMessage('chat-message')
  async chatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    try {
      const actor = this.requireSocketUser(client);
      const message = await this.chatService.sendMessage({
        ...body,
        senderId: actor.userId,
        senderRole: actor.role,
      }, {
        userId: actor.userId,
        role: actor.role,
      });

      const payload = RealtimeGateway.emitOperational('chat-message', message);

      return {
        ...this.ack('chat-message', payload),
        messageId: message.id,
      };
    } catch (error) {
      return this.errorAck('chat-message', error);
    }
  }

  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    try {
      const actor = this.requireSocketUser(client);
      const payload = await this.chatService.typing({
        ...body,
        senderId: actor.userId,
      }, {
        userId: actor.userId,
        role: actor.role,
      });
      const emitted = RealtimeGateway.emitOperational('typing', payload);

      return this.ack('typing', emitted);
    } catch (error) {
      return this.errorAck('typing', error);
    }
  }

  @SubscribeMessage('message-read')
  async messageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    try {
      const actor = this.requireSocketUser(client);
      const messageId = RealtimeGateway.readString(body?.messageId ?? body?.id);
      const message = await this.chatService.markAsRead(messageId, {
        userId: actor.userId,
        role: actor.role,
      });
      const payload = RealtimeGateway.emitOperational('message-read', {
        orderId: message.orderId,
        messageId: message.id,
        readAt: message.readAt,
        readerId: actor.userId,
      });

      return this.ack('message-read', payload);
    } catch (error) {
      return this.errorAck('message-read', error);
    }
  }

  private async joinOrderRooms(client: Socket, body: any, eventName: string) {
    const actor = this.requireSocketUser(client);
    const orderId = this.readOrderId(body);

    if (!orderId) {
      return {
        success: false,
        event: eventName,
        message: 'orderId is required',
        timestamp: new Date().toISOString(),
      };
    }

    await this.assertCanJoinOrder(actor, orderId);

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

  private async assertCanJoinOrder(
    actor: { userId: string; role?: string },
    orderId: string,
  ) {
    if (RealtimeGateway.readString(actor.role).toUpperCase() === 'ADMIN') {
      return;
    }

    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: orderId },
      select: {
        clientId: true,
        professionalId: true,
      },
    });

    if (
      order &&
      (order.clientId === actor.userId || order.professionalId === actor.userId)
    ) {
      return;
    }

    throw new Error('Acesso negado a sala da ordem');
  }

  private addPresence(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);
  }

  private emitPresence(userId: string, online: boolean) {
    const payload = {
      success: true,
      event: online ? 'user-online' : 'user-offline',
      userId,
      online,
      timestamp: new Date().toISOString(),
    };

    this.server?.emit('presence', payload);
    this.server?.emit(payload.event, payload);
  }

  private ack(eventName: string, payload: OperationalPayload) {
    return {
      success: true,
      event: eventName,
      orderId: payload.orderId,
      timestamp: payload.timestamp,
    };
  }

  private errorAck(eventName: string, error: any) {
    return {
      success: false,
      event: eventName,
      error: error?.name ?? 'REALTIME_EVENT_FAILED',
      message:
        error instanceof Error ? error.message : 'Falha ao processar evento',
      timestamp: new Date().toISOString(),
    };
  }

  private authenticateSocket(client: Socket) {
    const token = this.readSocketToken(client);

    if (!token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify(token);

      return {
        userId: RealtimeGateway.readString(payload?.sub),
        email: RealtimeGateway.readString(payload?.email),
        role: RealtimeGateway.readString(payload?.role),
      };
    } catch {
      return null;
    }
  }

  private requireSocketUser(client: Socket) {
    const user = client.data.user;

    if (!user?.userId) {
      throw new Error('Socket autenticado obrigatorio para chat');
    }

    return user as { userId: string; role?: string; email?: string };
  }

  private readSocketToken(client: Socket) {
    const authToken = RealtimeGateway.readString(client.handshake.auth?.token);
    const header = client.handshake.headers.authorization;
    const headerToken = Array.isArray(header) ? header[0] : header;
    const bearer = RealtimeGateway.readString(headerToken).replace(
      /^Bearer\s+/i,
      '',
    );

    return authToken || bearer || '';
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
