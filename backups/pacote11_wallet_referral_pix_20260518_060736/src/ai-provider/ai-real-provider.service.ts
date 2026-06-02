import { Injectable } from '@nestjs/common';

@Injectable()
export class AiRealProviderService {
  async classify(data: any) {
    return {
      success: true,
      provider: 'gemini/openai-ready',
      category: 'eletrica',
      confidence: 0.94,
      received: data,
      timestamp: new Date().toISOString(),
    };
  }

  async price(data: any) {
    return {
      success: true,
      provider: 'gemini/openai-ready',
      estimatedPrice: 240,
      urgentMultiplier: data.urgent ? 1.2 : 1,
      timestamp: new Date().toISOString(),
    };
  }
}
