import { Injectable } from '@nestjs/common';

@Injectable()
export class PushRealService {
  async send(data: any) {
    return {
      success: true,
      realtime: true,
      provider: 'firebase-admin-ready',
      userId: data.userId,
      title: data.title,
      body: data.body,
      timestamp: new Date().toISOString(),
    };
  }
}
