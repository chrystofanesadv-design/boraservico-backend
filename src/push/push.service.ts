import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class PushService {
  private initialized = false;
  private tokens = new Map<string, string>();

  private initFirebase() {
    if (this.initialized) return;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.initialized = false;
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    this.initialized = true;
  }

  saveToken(userId: string, token: string) {
    this.tokens.set(userId, token);

    return {
      success: true,
      userId,
      tokenSaved: true,
      savedAt: new Date().toISOString(),
    };
  }

  listTokens() {
    return Array.from(this.tokens.entries()).map(([userId, token]) => ({
      userId,
      token,
    }));
  }

  async sendToUser(userId: string, title: string, body: string, data?: any) {
    const token = this.tokens.get(userId);

    if (!token) {
      return {
        success: false,
        reason: 'FCM token not found for user',
        userId,
      };
    }

    return this.sendToToken(token, title, body, data);
  }

  async sendToToken(token: string, title: string, body: string, data?: any) {
    this.initFirebase();

    if (!this.initialized) {
      return {
        success: true,
        mode: 'mock',
        message: 'Firebase Admin env vars not configured yet',
        tokenPreview: token.substring(0, 20),
        title,
        body,
        data: data ?? {},
        sentAt: new Date().toISOString(),
      };
    }

    const response = await admin.messaging().send({
      token,
      notification: {
        title,
        body,
      },
      data: data ?? {},
    });

    return {
      success: true,
      mode: 'firebase',
      response,
      sentAt: new Date().toISOString(),
    };
  }
}
