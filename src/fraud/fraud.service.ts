import { Injectable } from '@nestjs/common';

@Injectable()
export class FraudService {
  analyze(data: any) {
    const score = Math.floor(Math.random() * 100);

    return {
      approved: score < 80,
      score,
      risk: score > 70 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW',
      reasons: [
        'Analise de comportamento',
        'Analise de frequencia',
        'Analise de valor',
      ],
      createdAt: new Date().toISOString(),
    };
  }
}
