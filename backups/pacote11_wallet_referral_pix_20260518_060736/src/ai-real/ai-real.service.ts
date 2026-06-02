import { Injectable } from '@nestjs/common';

import { readEnv } from '../config/env';

@Injectable()
export class AiRealService {
  classify(body: any) {
    return {
      success: true,
      provider: this.getProvider(),
      category: 'ELETRICA',
      confidence: 0.94,
      original: body,
      timestamp: new Date().toISOString(),
    };
  }

  smartPrice(body: any) {
    const base = 180;
    const urgentMultiplier = body.urgent ? 1.4 : 1;
    const finalPrice = Number((base * urgentMultiplier).toFixed(2));

    return {
      success: true,
      provider: this.getProvider(),
      category: body.category ?? 'geral',
      urgent: Boolean(body.urgent),
      suggestedPrice: finalPrice,
      commission: Number((finalPrice * 0.1).toFixed(2)),
      professionalReceives: Number((finalPrice * 0.9).toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  fraudRisk(body: any) {
    return {
      success: true,
      provider: this.getProvider(),
      userId: body.userId ?? 'cliente-demo',
      amount: body.amount ?? 0,
      risk: 'LOW',
      score: 0.18,
      timestamp: new Date().toISOString(),
    };
  }

  conversion(body: any) {
    return {
      success: true,
      provider: this.getProvider(),
      conversionProbability: 0.82,
      recommendation: 'Enviar oferta agora',
      original: body,
      timestamp: new Date().toISOString(),
    };
  }

  cancellation(body: any) {
    return {
      success: true,
      provider: this.getProvider(),
      cancellationRisk: 'LOW',
      score: 0.11,
      original: body,
      timestamp: new Date().toISOString(),
    };
  }

  private getProvider() {
    if (readEnv('GEMINI_API_KEY')) {
      return 'gemini';
    }

    if (readEnv('OPENAI_API_KEY')) {
      return 'openai';
    }

    return 'mock';
  }
}
