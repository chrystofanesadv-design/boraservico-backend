import * as admin from 'firebase-admin';
import * as fs from 'fs';

export class FirebaseService {
  private static initialized = false;

  /// 🔥 INIT FIREBASE ADMIN
  static init() {
    if (this.initialized) return;

    const serviceAccount = JSON.parse(
      fs.readFileSync('firebase-service-account.json', 'utf8'),
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    this.initialized = true;
    console.log('🔥 Firebase Admin iniciado');
  }

  /// 🔔 ENVIAR NOTIFICAÇÃO PARA PROFISSIONAIS
  static async sendNewOrderNotification(tokens: string[], order: any) {
    this.init();

    const message = {
      notification: {
        title: '🚀 Nova Ordem Disponível',
        body: `Serviço: ${order.title}`,
      },
      data: {
        orderId: String(order.id),
        serviceId: String(order.serviceId),
        type: 'NEW_ORDER',
      },
      tokens,
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log('📩 Push enviado:', response.successCount);
    } catch (error) {
      console.error('❌ Erro push:', error);
    }
  }
}