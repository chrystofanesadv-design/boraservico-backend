import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // 🧠 userId -> socketId
  private userSocketMap = new Map<string, string>();

  // 🧠 tracking rooms
  private trackingRooms = new Map<string, Set<string>>();

  // =========================
  // 🟢 CONEXÃO
  // =========================
  handleConnection(client: Socket) {
    console.log(`🟢 Cliente conectado: ${client.id}`);
  }

  // =========================
  // 🔴 DESCONECTADO
  // =========================
  handleDisconnect(client: Socket) {
    console.log(`🔴 Cliente desconectado: ${client.id}`);

    // remove user socket
    for (const [userId, socketId] of this.userSocketMap.entries()) {
      if (socketId === client.id) {
        this.userSocketMap.delete(userId);
        break;
      }
    }

    // remove tracking room references
    for (const [orderId, sockets] of this.trackingRooms.entries()) {
      sockets.delete(client.id);

      if (sockets.size === 0) {
        this.trackingRooms.delete(orderId);
      }
    }
  }

  // =========================
  // 🔐 REGISTRAR USUÁRIO
  // =========================
  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      userId: string;
      role: 'CLIENT' | 'PROFESSIONAL';
    },
  ) {
    if (!data?.userId || !data?.role) {
      return {
        event: 'registered',
        data: { success: false },
      };
    }

    // salva socket
    this.userSocketMap.set(data.userId, client.id);

    // room por tipo
    client.join(data.role);

    console.log(
      `📌 User registrado: ${data.userId} (${data.role})`,
    );

    return {
      event: 'registered',
      data: { success: true },
    };
  }

  // =========================
  // 📍 ENTRAR TRACKING
  // =========================
  @SubscribeMessage('join-tracking')
  handleJoinTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      orderId: string;
    },
  ) {
    if (!data?.orderId) {
      return { success: false };
    }

    const room = `tracking-${data.orderId}`;

    client.join(room);

    if (!this.trackingRooms.has(data.orderId)) {
      this.trackingRooms.set(
        data.orderId,
        new Set(),
      );
    }

    this.trackingRooms
      .get(data.orderId)
      ?.add(client.id);

    console.log(
      `📍 Tracking conectado: ${data.orderId}`,
    );

    return {
      success: true,
    };
  }

  // =========================
  // 🚗 GPS UPDATE REALTIME
  // =========================
  @SubscribeMessage('location-update')
  handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      orderId: string;
      professionalId: string;
      lat: number;
      lng: number;
    },
  ) {
    if (
      !data?.orderId ||
      !data?.professionalId ||
      !data?.lat ||
      !data?.lng
    ) {
      return {
        success: false,
      };
    }

    const room = `tracking-${data.orderId}`;

    this.server.to(room).emit(
      'professional-location',
      {
        orderId: data.orderId,
        professionalId: data.professionalId,
        lat: data.lat,
        lng: data.lng,
        updatedAt: new Date(),
      },
    );

    return {
      success: true,
    };
  }

  // =========================
  // 🌐 BROADCAST GLOBAL
  // =========================
  sendToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  // =========================
  // 👷 TODOS PROFISSIONAIS
  // =========================
  sendToProfessionals(
    event: string,
    payload: any,
  ) {
    this.server
      .to('PROFESSIONAL')
      .emit(event, payload);
  }

  // =========================
  // 👤 USUÁRIO ESPECÍFICO
  // =========================
  sendToUser(
    userId: string,
    event: string,
    payload: any,
  ) {
    const socketId =
      this.userSocketMap.get(userId);

    if (!socketId) {
      console.log(
        `⚠️ usuário offline: ${userId}`,
      );
      return;
    }

    this.server
      .to(socketId)
      .emit(event, payload);
  }

  // =========================
  // 📦 UPDATE ORDEM
  // =========================
  sendOrderUpdate(
    userId: string,
    payload: any,
  ) {
    this.sendToUser(
      userId,
      'order-update',
      payload,
    );
  }

  // =========================
  // 🚀 NOVO SERVIÇO
  // =========================
  sendNewServiceToProfessionals(
    payload: any,
  ) {
    this.sendToProfessionals(
      'new-service',
      payload,
    );
  }

  // =========================
  // 📍 EMITIR TRACKING
  // =========================
  emitTrackingUpdate(
    orderId: string,
    payload: any,
  ) {
    this.server
      .to(`tracking-${orderId}`)
      .emit(
        'professional-location',
        payload,
      );
  }
}