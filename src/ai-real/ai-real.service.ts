import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import {
  getAiProviderPreference,
  getGeminiModel,
  getOpenAiModel,
  getPlatformCommissionRate,
  readEnv,
} from '../config/env';

type AiProvider = 'gemini' | 'openai';

@Injectable()
export class AiRealService {
  private readonly logger = new Logger(AiRealService.name);
  private readonly platformCommissionRate = getPlatformCommissionRate();

  status() {
    const providers = this.availableProviders();
    const activeProvider = providers[0];

    return {
      success: true,
      module: 'ai-real',
      operational: providers.length > 0,
      activeProvider: activeProvider ?? null,
      fallbackProvider: providers[1] ?? null,
      providerPreference: getAiProviderPreference(),
      geminiReady: Boolean(readEnv('GEMINI_API_KEY')),
      openAiReady: Boolean(readEnv('OPENAI_API_KEY')),
      models: {
        gemini: getGeminiModel(),
        openai: getOpenAiModel(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  async classify(body: any) {
    const result = await this.runJsonTask('classify', body, [
      'Return JSON with category, confidence from 0 to 1, urgency, tags and summary.',
      'Use Brazilian Portuguese category names for a home services marketplace.',
    ]);

    return {
      success: true,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      category: this.readString(result.data.category) ?? 'geral',
      confidence: this.readNumber(result.data.confidence, 0),
      urgency: this.readString(result.data.urgency) ?? 'normal',
      tags: this.readStringArray(result.data.tags),
      summary: this.readString(result.data.summary),
      original: body,
      timestamp: new Date().toISOString(),
    };
  }

  async smartPrice(body: any) {
    const category = this.readString(body?.category) ?? 'geral';
    return {
      success: true,
      provider: 'policy',
      fallbackUsed: false,
      category,
      pricingDisabled: true,
      noPricePolicy: true,
      explanation:
        'A IA intermediadora organiza briefing, riscos e comparacao, mas nao sugere preco nem calcula valor final.',
      allowedActions: [
        'entender problema',
        'gerar resumo tecnico',
        'sugerir perguntas',
        'detectar inconsistencias',
        'comparar propostas reais',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  async fraudRisk(body: any) {
    const result = await this.runJsonTask('fraud-risk', body, [
      'Return JSON with score from 0 to 1, risk LOW/MEDIUM/HIGH/CRITICAL, approved boolean and reasons array.',
      'Evaluate payment, order and account-abuse risk. Do not include secrets.',
    ]);
    const score = this.clamp(this.readNumber(result.data.score, 0));

    return {
      success: true,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      userId: this.readString(body?.userId),
      amount: this.readNumber(body?.amount, 0),
      risk: this.normalizeRisk(result.data.risk, score),
      score,
      approved: result.data.approved ?? score < 0.85,
      reasons: this.readStringArray(result.data.reasons),
      timestamp: new Date().toISOString(),
    };
  }

  async conversion(body: any) {
    const result = await this.runJsonTask('conversion', body, [
      'Return JSON with conversionProbability from 0 to 1, recommendation and reasons array.',
      'Focus on improving completion of a local service order.',
    ]);

    return {
      success: true,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      conversionProbability: this.clamp(
        this.readNumber(result.data.conversionProbability, 0),
      ),
      recommendation: this.readString(result.data.recommendation),
      reasons: this.readStringArray(result.data.reasons),
      original: body,
      timestamp: new Date().toISOString(),
    };
  }

  async cancellation(body: any) {
    const result = await this.runJsonTask('cancellation', body, [
      'Return JSON with score from 0 to 1, cancellationRisk LOW/MEDIUM/HIGH/CRITICAL and reasons array.',
      'Focus on signals that a service order may be cancelled.',
    ]);
    const score = this.clamp(this.readNumber(result.data.score, 0));

    return {
      success: true,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      cancellationRisk: this.normalizeRisk(result.data.cancellationRisk, score),
      score,
      reasons: this.readStringArray(result.data.reasons),
      original: body,
      timestamp: new Date().toISOString(),
    };
  }

  private async runJsonTask(
    task: string,
    payload: any,
    instructions: string[],
  ) {
    const providers = this.availableProviders();

    if (providers.length === 0) {
      throw new BadRequestException('AI_PROVIDER_NOT_CONFIGURED');
    }

    const failures: string[] = [];

    for (const provider of providers) {
      try {
        const data = await this.callProvider(
          provider,
          task,
          payload,
          instructions,
        );

        return {
          provider,
          fallbackUsed: provider !== providers[0],
          data,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI_ERROR';
        failures.push(`${provider}:${message}`);
        this.logger.warn(`AI provider ${provider} failed: ${message}`);
      }
    }

    throw new BadRequestException({
      error: 'AI_PROVIDER_FAILED',
      providersTried: providers,
      failures,
    });
  }

  private async callProvider(
    provider: AiProvider,
    task: string,
    payload: any,
    instructions: string[],
  ) {
    const prompt = this.buildPrompt(task, payload, instructions);

    if (provider === 'gemini') {
      return this.callGemini(prompt);
    }

    return this.callOpenAi(prompt);
  }

  private async callGemini(prompt: string) {
    const apiKey = readEnv('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY_MISSING');
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        getGeminiModel(),
      )}:generateContent`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      },
      {
        params: { key: apiKey },
        timeout: 20000,
      },
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return this.parseJson(text);
  }

  private async callOpenAi(prompt: string) {
    const apiKey = readEnv('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY_MISSING');
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: getOpenAiModel(),
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a production AI service for BoraServico. Always return valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      },
    );
    const text = response.data?.choices?.[0]?.message?.content;

    return this.parseJson(text);
  }

  private availableProviders(): AiProvider[] {
    const geminiReady = Boolean(readEnv('GEMINI_API_KEY'));
    const openAiReady = Boolean(readEnv('OPENAI_API_KEY'));
    const preference = getAiProviderPreference();
    const preferred =
      preference === 'gemini' || preference === 'openai'
        ? preference
        : undefined;
    const providers: AiProvider[] = [];

    if (preferred === 'gemini' && geminiReady) {
      providers.push('gemini');
    }

    if (preferred === 'openai' && openAiReady) {
      providers.push('openai');
    }

    if (geminiReady && !providers.includes('gemini')) {
      providers.push('gemini');
    }

    if (openAiReady && !providers.includes('openai')) {
      providers.push('openai');
    }

    return providers;
  }

  private buildPrompt(task: string, payload: any, instructions: string[]) {
    return [
      `Task: ${task}`,
      ...instructions,
      'Return compact JSON. Do not return Markdown.',
      `Input JSON: ${JSON.stringify(this.redact(payload))}`,
    ].join('\n');
  }

  private parseJson(value: any): Record<string, any> {
    const text = this.readString(value);

    if (!text) {
      throw new Error('AI_EMPTY_RESPONSE');
    }

    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');

      if (start >= 0 && end > start) {
        return JSON.parse(text.slice(start, end + 1));
      }

      throw new Error('AI_INVALID_JSON');
    }
  }

  private localPriceFallback(body: any) {
    const base = this.readNumber(body?.basePrice ?? body?.amount, 180);
    return body?.urgent ? base * 1.4 : base;
  }

  private normalizeRisk(value: any, score: number) {
    const risk = this.readString(value)?.toUpperCase();
    const allowed = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    if (risk && allowed.includes(risk)) {
      return risk;
    }

    if (score >= 0.9) {
      return 'CRITICAL';
    }

    if (score >= 0.7) {
      return 'HIGH';
    }

    if (score >= 0.4) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private redact(value: any) {
    const copy =
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...value }
        : { value };

    for (const key of Object.keys(copy)) {
      const normalized = key.toLowerCase();

      if (
        normalized.includes('token') ||
        normalized.includes('secret') ||
        normalized.includes('key') ||
        normalized.includes('password')
      ) {
        copy[key] = '[redacted]';
      }
    }

    return copy;
  }

  private readStringArray(value: any) {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.readString(item))
        .filter(Boolean) as string[];
    }

    const text = this.readString(value);
    return text ? [text] : [];
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readNumber(value: any, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private clamp(value: number) {
    return Math.max(0, Math.min(1, value));
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }
}
