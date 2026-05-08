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

  // 🧠 mapa simples em memória (produção pode virar Redis)
  private userSocketMap = new Map<string, string>();

  // 🟢 conexão
  handleConnection(client: Socket) {
    console.log(`🟢 Cliente conectado: ${client.id}`);
  }

  // 🔴 desconexão
  handleDisconnect(client: Socket) {
    console.log(`🔴 Cliente desconectado: ${client.id}`);

    for (const [userId, socketId] of this.userSocketMap.entries()) {
      if (socketId === client.id) {
        this.userSocketMap.delete(userId);
        break;
      }
    }
  }

  // 🔐 REGISTRAR USUÁRIO NO SOCKET
  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; role: 'CLIENT' | 'PROFESSIONAL' },
  ) {
    this.userSocketMap.set(data.userId, client.id);

    client.join(data.role); // room por tipo

    console.log(`📌 User registrado: ${data.userId} (${data.role})`);

    return {
      event: 'registered',
      data: { success: true },
    };
  }

  // 📡 broadcast geral
  sendToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  // 👨‍🔧 enviar para todos profissionais
  sendToProfessionals(event: string, payload: any) {
    this.server.to('PROFESSIONAL').emit(event, payload);
  }

  // 👤 enviar para cliente específico
  sendToUser(userId: string, event: string, payload: any) {
    const socketId = this.userSocketMap.get(userId);

    if (socketId) {
      this.server.to(socketId).emit(event, payload);
    }
  }
}