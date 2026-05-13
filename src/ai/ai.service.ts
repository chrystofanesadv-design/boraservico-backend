import { Injectable } from '@nestjs/common';

@Injectable()
export class AiService {

  classify(data: any) {
    const text =
      `${data?.title ?? ''} ${data?.description ?? ''}`.toLowerCase();

    let category = 'geral';

    if (
      text.includes('eletrica') ||
      text.includes('eletricista') ||
      text.includes('tomada') ||
      text.includes('energia')
    ) {
      category = 'eletrica';
    }

    else if (
      text.includes('limpeza') ||
      text.includes('faxina')
    ) {
      category = 'limpeza';
    }

    else if (
      text.includes('encanamento') ||
      text.includes('cano')
    ) {
      category = 'hidraulica';
    }

    return {
      success: true,
      category,
      confidence: 0.92,
      analyzedAt: new Date(),
    };
  }

  price(data: any) {
    const category = `${data?.category ?? ''}`.toLowerCase();

    let suggestedPrice = 100;

    if (category === 'eletrica') {
      suggestedPrice = 180;
    }

    else if (category === 'limpeza') {
      suggestedPrice = 120;
    }

    else if (category === 'hidraulica') {
      suggestedPrice = 220;
    }

    const urgencyMultiplier =
      data?.urgent === true ? 1.5 : 1;

    suggestedPrice =
      suggestedPrice * urgencyMultiplier;

    return {
      success: true,
      category,
      urgent: data?.urgent ?? false,
      suggestedPrice,
      minimumPrice: suggestedPrice * 0.8,
      maximumPrice: suggestedPrice * 1.4,
      analyzedAt: new Date(),
    };
  }

  fraudRisk(data: any) {
    let risk = 5;

    const price = Number(data?.price ?? 0);

    if (price > 5000) {
      risk += 35;
    }

    if (data?.newAccount === true) {
      risk += 25;
    }

    if (data?.multipleCancels === true) {
      risk += 30;
    }

    let level = 'LOW';

    if (risk >= 70) {
      level = 'HIGH';
    }

    else if (risk >= 40) {
      level = 'MEDIUM';
    }

    return {
      success: true,
      riskScore: risk,
      level,
      analyzedAt: new Date(),
    };
  }

  cancelRisk(data: any) {
    let probability = 10;

    if (data?.lateNight === true) {
      probability += 20;
    }

    if (data?.newClient === true) {
      probability += 25;
    }

    if (data?.highPrice === true) {
      probability += 15;
    }

    let level = 'LOW';

    if (probability >= 60) {
      level = 'HIGH';
    }

    else if (probability >= 35) {
      level = 'MEDIUM';
    }

    return {
      success: true,
      cancelProbability: probability,
      level,
      analyzedAt: new Date(),
    };
  }

  conversion(data: any) {
    let score = 50;

    if (data?.hasPhoto === true) {
      score += 15;
    }

    if (data?.fastResponse === true) {
      score += 20;
    }

    if (data?.verifiedProfessional === true) {
      score += 15;
    }

    if (score > 100) {
      score = 100;
    }

    return {
      success: true,
      conversionScore: score,
      estimatedChance: `${score}%`,
      analyzedAt: new Date(),
    };
  }
}
